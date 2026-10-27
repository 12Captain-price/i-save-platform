import {afterEach,describe,expect,it,vi} from 'vitest';
import {backendFetch,gatewayRequest,validateHostedConfiguration} from '@/lib/gateway-server';
import {handleAuthentication} from '@/lib/auth-server';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
function hosted(){
  vi.stubEnv('ISAVE_ENV','production');vi.stubEnv('PUBLIC_ORIGIN','https://staging.isave.example.org');
  vi.stubEnv('AUTH_API_ORIGIN','http://backend:8000');vi.stubEnv('GATEWAY_TOKEN','b'.repeat(43));vi.stubEnv('GATEWAY_TOKEN_FILE','');
}
function request(path='/api/auth/login',ip='198.51.100.21'){
  return new Request('http://frontend:3000'+path,{method:'POST',headers:{host:'staging.isave.example.org',origin:'https://staging.isave.example.org','x-isave-request':'1','content-type':'application/json','x-isave-gateway':'b'.repeat(43),'x-isave-client-ip':ip,'x-isave-proto':'https','x-forwarded-for':'forged'},body:JSON.stringify({email:'synthetic@example.test',password:'synthetic-input-only'})});
}
describe('Hosted transport boundary',()=>{
  it('rejects missing gateway credentials even with forged forwarded headers',async()=>{
    hosted();const r=await gatewayRequest(new Request('http://frontend:3000/',{headers:{'x-forwarded-proto':'https'}}),async()=>new Response('wrong'));
    expect((r as Response).status).toBe(403);
  });
  it('requires canonical host and a single valid client address',async()=>{
    hosted();const r=await gatewayRequest(request('/','198.51.100.21, 198.51.100.22'),async()=>new Response('wrong'));
    expect((r as Response).status).toBe(403);
    const input=request();input.headers.set('host','attacker.example.org');
    expect((await gatewayRequest(input,async()=>new Response('wrong')) as Response).status).toBe(403);
  });
  it('canonicalises HTTPS and issues a Secure HttpOnly cookie without returning the token',async()=>{
    hosted();const fetcher=vi.fn().mockResolvedValue(Response.json({access_token:'x'.repeat(43)}));vi.stubGlobal('fetch',fetcher);
    const r=await handleAuthentication(request());
    expect(r?.status).toBe(200);expect(r?.headers.get('set-cookie')).toContain('; Secure');expect(r?.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await r?.json()).toEqual({signedIn:true});
    const headers=fetcher.mock.lastCall![1].headers as Headers;
    expect(headers.get('x-isave-client-ip')).toBe('198.51.100.21');expect(headers.has('x-forwarded-for')).toBe(false);
  });
  it('keeps concurrent client assertions isolated',async()=>{
    hosted();const seen:string[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{seen.push(init.headers.get('x-isave-client-ip'));return new Response('{}')}));
    await Promise.all(['198.51.100.21','198.51.100.22'].map(ip=>gatewayRequest(request('/',ip),async()=>{await new Promise(r=>setTimeout(r,1));return backendFetch('http://backend:8000/api/v1/public/contacts')})));
    expect(seen.sort()).toEqual(['198.51.100.21','198.51.100.22']);
  });
  it('refuses unsafe hosted configuration and transport outside a request',()=>{
    hosted();validateHostedConfiguration();expect(()=>backendFetch('http://backend:8000/')).toThrow();
    vi.stubEnv('PUBLIC_ORIGIN','http://localhost:3000');expect(validateHostedConfiguration).toThrow('Unsafe hosted');
  });
  it('keeps local development access without requiring gateway headers',async()=>{
    vi.stubEnv('ISAVE_ENV','development');expect((await gatewayRequest(new Request('http://localhost:3000'),async()=>new Response('ok')) as Response).status).toBe(200);
  });
});
