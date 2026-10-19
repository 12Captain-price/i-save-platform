// Imported only by the server entry. Never serialize bearer tokens into HTML/JSON.
import { isWorkspace, type Identity } from './auth-types';

const COOKIE = 'isave_session';
const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
const message = (error: string, status: number) => Response.json({ error }, { status, headers });

function tokenFrom(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const values = cookie.split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`));
  if (values.length !== 1) return null;
  const token = values[0]?.slice(COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function cookie(request: Request, token: string | null) {
  return `${COOKIE}=${token ?? ''}; Path=/; HttpOnly; SameSite=Strict${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}${token ? '' : '; Max-Age=0'}`;
}

function expired(request: Request) {
  const response = message('Your session has expired. Please log in again.', 401);
  response.headers.set('Set-Cookie', cookie(request, null));
  return response;
}

async function upstream(path: string, init: RequestInit = {}) {
  const origin = process.env['AUTH_API_ORIGIN'] ?? 'http://127.0.0.1:8000';
  return fetch(new URL(`/api/v1/auth/${path}`, origin), {
    ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
}

async function adminRead(request: Request, url: URL) {
  if (request.method !== 'GET') return message('Method not allowed.', 405);
  const target = url.pathname === '/api/admin/overview' ? '/api/v1/admin/overview' :
    url.pathname === '/api/admin/members' ? '/api/v1/members/page' : null;
  if (!target) return message('Not found.', 404);
  const token = tokenFrom(request);
  if (!token) return expired(request);
  const params = new URLSearchParams();
  const supported = target.endsWith('/page') ? ['q', 'skip', 'limit'] : [];
  for (const [key, value] of url.searchParams) {
    if (!supported.includes(key) || params.has(key)) return message('Unsupported search parameters.', 400);
    params.set(key, value);
  }
  const origin = process.env['AUTH_API_ORIGIN'] ?? 'http://127.0.0.1:8000';
  const endpoint = new URL(target, origin);
  endpoint.search = params.toString();
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (response.status === 401) return expired(request);
  if (response.status === 403) return message('Your account does not have permission to view these records.', 403);
  if (response.status === 400) return message('Check your search or page settings.', 400);
  if (!response.ok) return message('Unable to load records. Please try again.', 503);
  return Response.json(await response.json(), { headers });
}

async function identity(token: string): Promise<Identity | null> {
  const response = await upstream('me', { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Authentication unavailable');
  const data = await response.json() as Identity;
  if (!data.user?.is_active || !Array.isArray(data.permissions)) throw new Error('Invalid identity');
  return { user: { id: data.user.id, email: data.user.email, is_active: data.user.is_active, role_id: data.user.role_id },
    workspace: isWorkspace(data.workspace) ? data.workspace : null, permissions: data.permissions };
}

// The sole browser authentication boundary. Only explicitly listed authentication and read paths are proxied.
export async function handleAuthentication(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/auth/') && !path.startsWith('/api/admin/') && !/^\/portal(?:\/|$)/.test(path)) return null;
  try {
    if (path.startsWith('/api/admin/')) return await adminRead(request, url);
    if (path.startsWith('/api/auth/')) {
      const action = path.slice('/api/auth/'.length);
      if (!['login', 'me', 'logout'].includes(action)) return message('Not found.', 404);
      if (request.method !== (action === 'me' ? 'GET' : 'POST')) return message('Method not allowed.', 405);
      if (request.method === 'POST' && (request.headers.get('origin') !== url.origin ||
          request.headers.get('x-isave-request') !== '1')) return message('Request could not be verified. Reload and try again.', 403);
      if (action === 'login') {
        if (!request.headers.get('content-type')?.startsWith('application/json')) return message('Enter your email and password.', 400);
        const body = await request.text();
        if (body.length > 4096) return message('Enter a valid email and password.', 400);
        let input: { email?: unknown; password?: unknown };
        try { input = JSON.parse(body); } catch { return message('Enter your email and password.', 400); }
        if (!input || typeof input.email !== 'string' || typeof input.password !== 'string') return message('Enter your email and password.', 400);
        // Refuse replacing a valid browser session without logout, avoiding orphan sessions.
        const previous = tokenFrom(request);
        if (previous && await identity(previous)) return message('You are already signed in. Log out to change accounts.', 409);
        const response = await upstream('login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: input.email, password: input.password }) });
        if (!response.ok) return message(response.status === 401 ? 'Incorrect email or password.' :
          response.status === 429 ? 'Too many attempts. Please try again later.' :
          response.status === 400 ? 'Check your email and password.' : 'Login is temporarily unavailable. Please try again.',
        [400, 401, 429].includes(response.status) ? response.status : 503);
        const result = await response.json() as { access_token?: string };
        if (!result.access_token || !/^[A-Za-z0-9_-]{43}$/.test(result.access_token)) throw new Error('Invalid session');
        return Response.json({ signedIn: true }, { headers: { ...headers, 'Set-Cookie': cookie(request, result.access_token) } });
      }
      const token = tokenFrom(request);
      if (action === 'me') {
        if (!token) return expired(request);
        const data = await identity(token);
        return data ? Response.json(data, { headers }) : expired(request);
      }
      if (token) {
        const response = await upstream('logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok && response.status !== 401) throw new Error('Logout unavailable');
      }
      return new Response(null, { status: 204, headers: { ...headers, 'Set-Cookie': cookie(request, null) } });
    }
    const legacy = path.match(/^\/portal\/member\/(login|register|recovery|verify|setup-password)\/?$/);
    if (legacy) return new Response(null, { status: 302, headers: { ...headers, Location: `/${legacy[1]}` } });
    const token = tokenFrom(request);
    const data = token ? await identity(token) : null;
    if (!data) return new Response(null, { status: 302, headers: { ...headers, Location: '/login', 'Set-Cookie': cookie(request, null) } });
    const role = path.split('/')[2];
    if (data.workspace && (!role || role !== data.workspace)) return new Response(null, {
      status: 302, headers: { ...headers, Location: `/portal/${data.workspace}/dashboard` },
    });
    return null;
  } catch {
    // Never log request bodies, cookies, upstream responses or exception objects.
    return message('Authentication is temporarily unavailable. Please try again.', 503);
  }
}

