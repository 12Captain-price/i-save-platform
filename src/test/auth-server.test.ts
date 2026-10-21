import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAuthentication } from '@/lib/auth-server';

const token = 'x'.repeat(43);
const identity = { user: { id: 1, email: 'synthetic@example.test', is_active: true, role_id: 1 }, workspace: 'member', permissions: ['members:own'] };
function request(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost:3000${path}`, init);
}
const post = { method: 'POST', headers: { origin: 'http://localhost:3000', 'X-Isave-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'synthetic@example.test', password: 'test-input' }) };
afterEach(() => vi.unstubAllGlobals());

describe('Server authentication boundary', () => {
  it('protects fee rate publication and subscription payment bridges against forged origins and arbitrary paths',async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({completed:true}));vi.stubGlobal('fetch',fetcher);
    const requestData={...post,headers:{...post.headers,cookie:`isave_session=${token}`}};
    expect((await handleAuthentication(request('/api/admin/fee-rates/publish',{...requestData,headers:{...requestData.headers,origin:'https://attacker.test'}})))?.status).toBe(403);
    expect((await handleAuthentication(request('/api/membership/subscriptions/1/payment',{...requestData,headers:{...requestData.headers,origin:'https://attacker.test'}})))?.status).toBe(403);
    expect((await handleAuthentication(request('/api/membership/subscriptions?member_id=9',{headers:{cookie:`isave_session=${token}`}})))?.status).toBe(400);
    expect((await handleAuthentication(request('/api/admin/fee-rates/secrets',requestData)))?.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await handleAuthentication(request('/api/membership/subscriptions/1/payment',requestData)))?.status).toBe(200);
    expect(fetcher.mock.lastCall![1].headers.Authorization).toBe(`Bearer ${token}`);
  });
  it('keeps business settings behind fixed paths, origin verification and the session cookie',async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({version:2},{status:201}));vi.stubGlobal('fetch',fetcher);
    const input={...post,body:JSON.stringify({request_key:'synthetic',base_version:1,terms:{}}),headers:{...post.headers,cookie:`isave_session=${token}`,Authorization:'Bearer spoofed'}};
    expect((await handleAuthentication(request('/api/admin/organisation-settings',{...input,headers:{...input.headers,origin:'https://attacker.test'}})))?.status).toBe(403);
    expect((await handleAuthentication(request('/api/admin/organisation-settings/secrets',input)))?.status).toBe(404);
    expect((await handleAuthentication(request('/api/admin/organisation-settings?actor_id=7',input)))?.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await handleAuthentication(request('/api/admin/organisation-settings',input)))?.status).toBe(201);
    expect(fetcher.mock.lastCall![1].headers.Authorization).toBe(`Bearer ${token}`);
  });
  it('exposes only a fixed public contacts bridge without forwarding browser credentials',async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({office:'Published office'}));vi.stubGlobal('fetch',fetcher);
    const response=await handleAuthentication(request('/api/public/contacts',{headers:{cookie:`isave_session=${token}`,Authorization:'Bearer spoofed'}}));
    expect(response?.status).toBe(200);expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(fetcher.mock.lastCall![1].headers).toBeUndefined();
    expect((await handleAuthentication(request('/api/public/contacts?draft=true')))?.status).toBe(404);
  });
  it('translates settings validation into useful field guidance without reflecting input',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:{code:'validation_error',message:'Request validation failed',details:{errors:[{loc:['body','terms','subscription_due_day'],type:'less_than_equal',input:'PRIVATE'}]}}},{status:400})));
    const response=await handleAuthentication(request('/api/admin/organisation-settings',{...post,headers:{...post.headers,cookie:`isave_session=${token}`}}));
    expect(response?.status).toBe(400);const body=await response?.text();expect(body).toContain('Due day: use 1–28 or leave blank');expect(body).not.toContain('PRIVATE');
  });
  it('restricts draft writes to fixed paths, browser-origin checks and the session cookie', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ draft_id:1 }, { status:201 })); vi.stubGlobal('fetch',fetcher);
    const data = { ...post, body:JSON.stringify({ request_key:'synthetic',base_version:0,terms:{} }), headers:{ ...post.headers,cookie:`isave_session=${token}`,Authorization:'Bearer spoofed' } };
    expect((await handleAuthentication(request('/api/admin/plan-drafts', { ...data,headers:{...data.headers,origin:'https://attacker.test'} })))?.status).toBe(403);
    expect((await handleAuthentication(request('/api/admin/plan-drafts/1/publish',data)))?.status).toBe(404);
    expect((await handleAuthentication(request('/api/admin/plan-drafts?actor_id=9',data)))?.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await handleAuthentication(request('/api/admin/plan-drafts',data)))?.status).toBe(201);
    const [url,init] = fetcher.mock.lastCall!;
    expect(String(url)).toContain('/api/v1/admin/plan-drafts');
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
    expect(init.body).toBe(data.body);
  });
  it('proxies only the signed-in overview and refuses member selectors and arbitrary methods',async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({member:null}));vi.stubGlobal('fetch',fetcher);
    expect((await handleAuthentication(request('/api/membership/overview')))?.status).toBe(401);
    expect((await handleAuthentication(request('/api/membership/overview?member_id=9',{headers:{cookie:`isave_session=${token}`}})))?.status).toBe(404);
    expect((await handleAuthentication(request('/api/membership/overview',{method:'POST',headers:{cookie:`isave_session=${token}`}})))?.status).toBe(405);
    const response=await handleAuthentication(request('/api/membership/overview',{headers:{cookie:`isave_session=${token}`,Authorization:'Bearer spoofed'}}));
    expect(response?.status).toBe(200);expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(fetcher.mock.calls[0]![0]).pathname).toBe('/api/v1/membership/overview');expect(fetcher.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${token}`);
  });
  it('limits membership bridges to fixed paths and rejects CSRF, query ownership and missing sessions',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    expect((await handleAuthentication(request('/api/membership/fees')))?.status).toBe(401);
    expect((await handleAuthentication(request('/api/membership/fees?member_id=2',{headers:{cookie:`isave_session=${token}`}})))?.status).toBe(404);
    expect((await handleAuthentication(request('/api/membership/applications/1/approve',{method:'POST',headers:{cookie:`isave_session=${token}`},body:'{}'})))?.status).toBe(403);
    expect((await handleAuthentication(request('/api/membership/unknown',{headers:{cookie:`isave_session=${token}`}})))?.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['member', 'staff', 'finance', 'admin'])('blocks direct anonymous %s URLs before SSR', async role => {
    const response = await handleAuthentication(request(`/portal/${role}/dashboard`));
    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe('/login');
  });
  it('rejects cross-origin and missing custom-header login attempts without contacting the API', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await handleAuthentication(request('/api/auth/login', { ...post, headers: { ...post.headers, origin: 'https://attacker.test' } }));
    expect(response?.status).toBe(403);
    expect((await handleAuthentication(request('/api/auth/logout', { method: 'POST', headers: { origin: 'http://localhost:3000' } })))?.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps login tokens out of JSON and uses a nonpersistent HttpOnly cookie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ access_token: token })));
    const response = await handleAuthentication(request('/api/auth/login', post));
    expect(await response?.json()).toEqual({ signedIn: true });
    const cookie = response?.headers.get('set-cookie');
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Max-Age');
    expect(response?.headers.get('cache-control')).toBe('no-store');
  });
  it('sets Secure cookies on HTTPS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ access_token: token })));
    const response = await handleAuthentication(new Request('https://isave.test/api/auth/login', { ...post, headers: { ...post.headers, origin: 'https://isave.test' } }));
    expect(response?.headers.get('set-cookie')).toContain('; Secure');
  });
  it('uses the backend workspace, not a requested role or cookie role', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(identity)));
    const response = await handleAuthentication(request('/portal/admin/dashboard', { headers: { cookie: `isave_session=${token}; role=admin` } }));
    expect(response?.headers.get('location')).toBe('/portal/member/dashboard');
  });
  it('clears expired credentials and never serves private SSR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const response = await handleAuthentication(request('/api/auth/me', { headers: { cookie: `isave_session=${token}` } }));
    expect(response?.status).toBe(401);
    expect(response?.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('does not report logout success or clear the cookie when backend revocation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const response = await handleAuthentication(request('/api/auth/logout', { ...post, headers: { ...post.headers, cookie: `isave_session=${token}` } }));
    expect(response?.status).toBe(503);
    expect(response?.headers.has('set-cookie')).toBe(false);
  });
  it('forwards logout as an authenticated backend POST then clears the session cookie', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetcher);
    const response = await handleAuthentication(request('/api/auth/logout', { ...post, headers: { ...post.headers, cookie: `isave_session=${token}` } }));
    expect(response?.status).toBe(204);
    expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe(`Bearer ${token}`);
    expect(response?.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it.each([401, 429, 503])('provides safe login errors for HTTP %s without forwarding upstream bodies', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream details', { status })));
    const response = await handleAuthentication(request('/api/auth/login', post));
    expect(response?.status).toBe(status);
    expect(await response?.text()).not.toContain('private upstream details');
  });
});

it('proxies only permitted read paths and query keys using the session cookie', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [], total: 0 })); vi.stubGlobal('fetch', fetcher);
  const auth = { headers: { cookie: `isave_session=${token}; role=admin` } };
  expect((await handleAuthentication(request('/api/admin/members')))?.status).toBe(401);
  expect((await handleAuthentication(request('/api/admin/members?actor_id=1', auth)))?.status).toBe(400);
  expect((await handleAuthentication(request('/api/admin/members?q=a&q=b', auth)))?.status).toBe(400);
  expect((await handleAuthentication(request('/api/admin/users', auth)))?.status).toBe(404);
  expect((await handleAuthentication(request('/api/admin/members', { ...auth, method: 'POST' })))?.status).toBe(405);
  expect(fetcher).not.toHaveBeenCalled();
  const response = await handleAuthentication(request('/api/admin/members?q=A%26B&skip=10&limit=10', auth));
  expect(response?.headers.get('cache-control')).toBe('no-store');
  const [url, options] = fetcher.mock.calls[0]!;
  expect(new URL(url).pathname).toBe('/api/v1/members/page');
  expect(new URL(url).searchParams.get('q')).toBe('A&B');
  expect(options.headers.Authorization).toBe(`Bearer ${token}`);
});

it.each([401,403,503])('preserves admin read failure %s without returning records', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive details', { status })));
  const response = await handleAuthentication(request('/api/admin/overview', { headers: { cookie: `isave_session=${token}` } }));
  expect(response?.status).toBe(status);
  expect(await response?.text()).not.toContain('sensitive details');
});


it('protects public registration CSRF and forwards neither cookies nor caller identities', async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:202}));vi.stubGlobal('fetch',fetcher);
 expect((await handleAuthentication(request('/api/registration',{...post,headers:{...post.headers,origin:'https://attacker.test'}})))?.status).toBe(403);
 expect(fetcher).not.toHaveBeenCalled();
 const response=await handleAuthentication(request('/api/registration',{...post,body:JSON.stringify({first_name:'Synthetic',last_name:'Test',email:'test@example.test'}),headers:{...post.headers,cookie:`isave_session=${token}`}}));
 expect(response?.status).toBe(202);expect(await response?.json()).toEqual({received:true});
 expect(fetcher.mock.calls[0]![1].headers).not.toHaveProperty('Authorization');expect(fetcher.mock.calls[0]![1].headers).not.toHaveProperty('cookie');
});
it('uses the authenticated backend for protected application detail reads',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:403}));vi.stubGlobal('fetch',fetcher);
 expect((await handleAuthentication(request('/api/review/applications/12',{headers:{cookie:`isave_session=${token}`}})))?.status).toBe(403);
 expect(new URL(fetcher.mock.calls[0]![0]).pathname).toBe('/api/v1/applications/review/12');
 expect(fetcher.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${token}`);
});

it('requires session and CSRF for assisted submission and forwards the cookie bearer, not caller headers',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:202}));vi.stubGlobal('fetch',fetcher);
 expect((await handleAuthentication(request('/api/registration/assisted',post)))?.status).toBe(401);
 expect(fetcher).not.toHaveBeenCalled();
 expect((await handleAuthentication(request('/api/registration/assisted',{...post,headers:{...post.headers,cookie:`isave_session=${token}`,origin:'https://attacker.test'}})))?.status).toBe(403);
 expect(fetcher).not.toHaveBeenCalled();
 const response=await handleAuthentication(request('/api/registration/assisted',{...post,headers:{...post.headers,cookie:`isave_session=${token}`,Authorization:'Bearer forged'}}));
 expect(response?.status).toBe(202);expect(await response?.json()).toEqual({received:true});
 expect(new URL(fetcher.mock.calls[0]![0]).pathname).toBe('/api/v1/registration/assisted');
 expect(fetcher.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${token}`);
});
it.each([401,403,503])('does not disclose upstream assisted submission errors (%s)',async status=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private account details',{status})));
 const response=await handleAuthentication(request('/api/registration/assisted',{...post,headers:{...post.headers,cookie:`isave_session=${token}`}}));
 expect(response?.status).toBe(status);expect(await response?.text()).not.toContain('private account details');
});
