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
    url.pathname === '/api/admin/members' ? '/api/v1/members/page' :
    url.pathname === '/api/review/applications' ? '/api/v1/applications/page' :
    /^\/api\/review\/applications\/[1-9][0-9]{0,9}$/.test(url.pathname) ?
      `/api/v1/applications/review/${url.pathname.split('/').at(-1)}` : null;
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

async function membership(request: Request, url: URL) {
  if(url.pathname.startsWith('/api/membership/subscriptions'))return subscriptionPayments(request,url);
  const match = url.pathname.match(/^\/api\/membership\/applications\/([1-9][0-9]{0,9})(?:\/(payment|verify|approve|activate|invitation|obligation))?$/);
  const fees = url.pathname === '/api/membership/fees';
  const overview = url.pathname === '/api/membership/overview';
  if ((!match && !fees && !overview) || url.search) return message('Not found.',404);
  const action = match?.[2];
  if (request.method !== (action ? 'POST' : 'GET')) return message('Method not allowed.',405);
  const token = tokenFrom(request);
  if (!token) return expired(request);
  let body: string | undefined;
  if (action) {
    if (request.headers.get('origin') !== url.origin || request.headers.get('x-isave-request') !== '1') return message('Reload and try again.',403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return message('Check the entered details.',400);
    body = await request.text();
    if (body.length > 4096) return message('Check the entered details.',400);
    try { JSON.parse(body); } catch { return message('Check the entered details.',400); }
  }
  const response = await fetch(new URL(`/api/v1/membership/${overview ? 'overview' : fees ? 'fees' : `applications/${match![1]}${action ? `/${action}` : ''}`}`,process.env['AUTH_API_ORIGIN'] ?? 'http://127.0.0.1:8000'),{
    method:request.method,headers:{Authorization:`Bearer ${token}`,...(action?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body}:{}),
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000),
  });
  if (response.status === 401) return expired(request);
  if (!response.ok) return message(response.status===403?'Your account does not have permission for this action.':
    response.status===409?'The prerequisites are not satisfied or a conflicting record exists. Refresh before retrying.':
    response.status===422 || response.status===400?'Check the entered details and acknowledgement.':
    response.status===429?'Too many attempts. Please try again later.':'Unable to complete this action. Refresh to check its status before retrying.',
    [400,403,409,422,429].includes(response.status)?response.status:503);
  return Response.json(await response.json(),{headers});
}

async function subscriptionPayments(request:Request,url:URL) {
  const match=url.pathname.match(/^\/api\/membership\/subscriptions(?:\/([1-9][0-9]{0,9})\/(payment|verify))?$/);
  if(!match)return message('Not found.',404);
  const writing=!!match[2];if(request.method!==(writing?'POST':'GET'))return message('Method not allowed.',405);
  const token=tokenFrom(request);if(!token)return expired(request);
  const endpoint=new URL('/api/v1/membership/subscriptions'+(writing?`/${match[1]}/${match[2]}`:''),process.env['AUTH_API_ORIGIN']??'http://127.0.0.1:8000');
  for(const [key,value] of url.searchParams){if(writing||!['skip','limit'].includes(key)||endpoint.searchParams.has(key))return message('Unsupported parameters.',400);endpoint.searchParams.set(key,value);}
  let body:string|undefined;
  if(writing){
    if(request.headers.get('origin')!==url.origin||request.headers.get('x-isave-request')!=='1')return message('Reload and try again.',403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return message('Check the payment fields.',400);
    body=await request.text();if(body.length>4096)return message('Check the payment fields.',400);
    try{JSON.parse(body);}catch{return message('Check the payment fields.',400);}
  }
  const response=await fetch(endpoint,{method:request.method,headers:{Authorization:`Bearer ${token}`,...(writing?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000)});
  if(response.status===401)return expired(request);
  if(!response.ok)return message(response.status===403?'Your account does not have permission for this fee action.':response.status===409?'A payment, reference or frozen quote conflicts. Refresh before retrying.':response.status===400?'Use the exact frozen amount/currency and check the reference and payment date.':'Fee action could not be confirmed. Refresh and retry safely.',[400,403,404,409].includes(response.status)?response.status:503);
  return Response.json(await response.json(),{status:response.status,headers});
}

async function organisationSettings(request:Request,url:URL) {
  if (!/^\/api\/admin\/(organisation-settings|fee-rates)(?:\/publish)?$/.test(url.pathname) || url.search) return message('Not found.',404);
  const resource=url.pathname.includes('/fee-rates')?'fee-rates':'organisation-settings';
  const publish=url.pathname.endsWith('/publish');
  if (request.method!=='POST' && (publish || request.method!=='GET')) return message('Method not allowed.',405);
  const token=tokenFrom(request); if (!token) return expired(request);
  let body:string|undefined;
  if (request.method==='POST') {
    if (request.headers.get('origin')!==url.origin || request.headers.get('x-isave-request')!=='1') return message('Reload and try again.',403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return message('Check the settings fields.',400);
    body=await request.text(); if(body.length>12000) return message('Settings text too long.',400);
    try {JSON.parse(body);} catch {return message('Check the settings fields.',400);}
  }
  const response=await fetch(new URL('/api/v1/admin/'+resource+(publish?'/publish':''),process.env['AUTH_API_ORIGIN']??'http://127.0.0.1:8000'),{
    method:request.method,headers:{Authorization:`Bearer ${token}`,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000),
  });
  if(response.status===401)return expired(request);
  if(!response.ok) {
    const data=await response.json().catch(()=>({}));
    const hints:Record<string,string>={
      office:'Office address: use at most 500 characters.',email:'Public email: enter a valid email address.',
      office_phone:'Office phone: include the country prefix and a valid phone number.',director_phone:'Director phone: include the country prefix and a valid phone number.',additional_phone:'Additional phone: include the country prefix and a valid phone number.',
      registration_amount:'Registration fee: enter a positive amount with up to two decimal places.',subscription_amount:'Subscription: enter a positive amount with up to two decimal places.',
      registration_currency:'Registration currency: use three uppercase letters.',subscription_currency:'Subscription currency: use three uppercase letters.',
      subscription_start:'Subscription start: choose the calendar month following activation.',subscription_due_day:'Due day: use 1–28 or leave blank; days 29–31 need an approved short-month rule.',
      review_acknowledgement:'Reviewer wording: use at most 2000 characters.',effective_at:'Effective date: enter a valid date and time including a timezone.',
      rate:'Rate: enter a positive ZiG-per-USD value with at most eight decimal places.',source:'Rate source: describe the source in at most 500 characters.',
    };
    const validation=data.error?.code==='validation_error' && Array.isArray(data.error?.details?.errors)?[...new Set((data.error.details.errors as {loc?:unknown[]}[]).slice(0,8).map(e=>hints[String(e.loc?.at(-1))]??'Check the request fields. Unsupported settings and actor IDs are not accepted.'))].join(' '):null;
    const safe=response.status===400 && validation?validation:response.status===400 && typeof data.error?.message==='string'?data.error.message:response.status===403?'Organisation settings permission required.':response.status===409?'Settings changed or conflicting request. Reload before continuing.':'Settings request could not be confirmed. Retry the same request.';
    return message(safe,[400,403,404,409].includes(response.status)?response.status:503);
  }
  return Response.json(await response.json(),{status:response.status,headers});
}

async function planDrafts(request: Request, url: URL) {
  const match = url.pathname.match(/^\/api\/admin\/plan-drafts(?:\/([1-9][0-9]{0,9}))?$/);
  if (!match) return message('Not found.', 404);
  const writing = request.method !== 'GET';
  if (writing && request.method !== (match[1] ? 'PUT' : 'POST')) return message('Method not allowed.', 405);
  const token = tokenFrom(request);
  if (!token) return expired(request);
  const endpoint = new URL(`/api/v1/admin/plan-drafts${match[1] ? `/${match[1]}` : ''}`, process.env['AUTH_API_ORIGIN'] ?? 'http://127.0.0.1:8000');
  for (const [key, value] of url.searchParams) {
    if (writing || match[1] || !['skip', 'limit'].includes(key) || endpoint.searchParams.has(key)) return message('Unsupported search parameters.', 400);
    endpoint.searchParams.set(key, value);
  }
  let body: string | undefined;
  if (writing) {
    if (request.headers.get('origin') !== url.origin || request.headers.get('x-isave-request') !== '1') return message('Reload and try again.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return message('Check the draft fields.', 400);
    body = await request.text();
    if (body.length > 24000) return message('Draft text is too long.', 400);
    try { JSON.parse(body); } catch { return message('Check the draft fields.', 400); }
  }
  const response = await fetch(endpoint, { method: request.method, headers: { Authorization: `Bearer ${token}`, ...(writing ? { 'Content-Type': 'application/json' } : {}) },
    ...(body === undefined ? {} : { body }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (response.status === 401) return expired(request);
  if (!response.ok) return message(response.status === 403 ? 'Administrator draft permission required.' : response.status === 409 ? 'Draft changed or conflicting request. Reload before saving.' : response.status === 400 ? 'Check the draft fields.' : 'Draft request could not be confirmed. Retry safely.', [400, 403, 404, 409].includes(response.status) ? response.status : 503);
  return Response.json(await response.json(), { status: response.status, headers });
}

// The sole browser authentication boundary. Only explicitly listed paths are proxied.
export async function handleAuthentication(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== '/api/public/contacts' && path !== '/api/registration' && path !== '/api/registration/assisted' && !path.startsWith('/api/membership/') && !path.startsWith('/api/review/') && !path.startsWith('/api/auth/') && !path.startsWith('/api/admin/') && !/^\/portal(?:\/|$)/.test(path)) return null;
  try {
    if (path === '/api/public/contacts') {
      if (request.method!=='GET' || url.search) return message('Not found.',404);
      const response=await fetch(new URL('/api/v1/public/contacts',process.env['AUTH_API_ORIGIN']??'http://127.0.0.1:8000'),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000)});
      return response.ok?Response.json(await response.json(),{headers}):message('Office contacts unavailable.',503);
    }
    if (path.startsWith('/api/admin/organisation-settings') || path.startsWith('/api/admin/fee-rates')) return await organisationSettings(request,url);
    if (path.startsWith('/api/admin/plan-drafts')) return await planDrafts(request, url);
    if (path.startsWith('/api/membership/')) return await membership(request,url);
    if (path === '/api/registration' || path === '/api/registration/assisted') {
      const assisted = path === '/api/registration/assisted';
      const token = assisted ? tokenFrom(request) : null;
      if (assisted && !token) return expired(request);
      if (request.method !== 'POST') return message('Method not allowed.', 405);
      if (request.headers.get('origin') !== url.origin || request.headers.get('x-isave-request') !== '1') return message('Reload the page and try again.', 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return message('Check your application details.', 400);
      const body = await request.text();
      if (body.length > 8192) return message('Check your application details.', 400);
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { return message('Check your application details.', 400); }
      const response = await fetch(new URL(assisted ? '/api/v1/registration/assisted' : '/api/v1/registration', process.env['AUTH_API_ORIGIN'] ?? 'http://127.0.0.1:8000'), {
        method:'POST', headers:{ 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) }, body:JSON.stringify(parsed),
        cache:'no-store', redirect:'error', signal:AbortSignal.timeout(10_000),
      });
      if (assisted && response.status === 401) return expired(request);
      if (assisted && response.status === 403) return message('Your account does not have permission for assisted submission.',403);
      if (response.status === 202) return Response.json({ received:true }, { status:202, headers });
      return message(response.status === 429 ? 'Too many submissions. Please try again later.' :
        response.status === 400 ? 'Check your application details and try again.' : 'Unable to submit your application. Please try again.',
        [400,429].includes(response.status) ? response.status : 503);
    }
    if (path.startsWith('/api/admin/') || path.startsWith('/api/review/')) return await adminRead(request, url);
    if (path.startsWith('/api/auth/')) {
      const action = path.slice('/api/auth/'.length);
      if (!['login', 'me', 'logout', 'setup-password'].includes(action)) return message('Not found.', 404);
      if (request.method !== (action === 'me' ? 'GET' : 'POST')) return message('Method not allowed.', 405);
      if (request.method === 'POST' && (request.headers.get('origin') !== url.origin ||
          request.headers.get('x-isave-request') !== '1')) return message('Request could not be verified. Reload and try again.', 403);
      if (action === 'setup-password') {
        if (!request.headers.get('content-type')?.startsWith('application/json')) return message('Check your password and setup link.',400);
        const body = await request.text();
        if (body.length > 4096) return message('Check your password and setup link.',400);
        let input: unknown;
        try { input = JSON.parse(body); } catch { return message('Check your password and setup link.',400); }
        const response = await upstream('setup-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
        if (response.status===204) return new Response(null,{status:204,headers});
        return message(response.status===400?'Check your password (12 to 72 characters, at most 72 UTF-8 bytes). If the setup link is invalid or expired, contact the office.':response.status===429?'Too many attempts. Please try again later.':'Password setup could not be confirmed. Retry or contact the office.',[400,429].includes(response.status)?response.status:503);
      }
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

