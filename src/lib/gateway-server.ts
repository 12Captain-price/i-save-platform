// Server-only transport. Never import this module from browser components.
import { AsyncLocalStorage } from 'node:async_hooks';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { hosted, privateToken, validateHostedConfiguration } from '../../deploy/validate-frontend.mjs';
export { validateHostedConfiguration };

const requests = new AsyncLocalStorage<Request>();
validateHostedConfiguration();

export async function gatewayRequest<T>(request:Request,run:(request:Request)=>Promise<T>):Promise<T|Response> {
  if(requests.getStore()===request)return run(request);
  if(!hosted()) return requests.run(request,()=>run(request));
  let canonical:Request;
  try {
    const expected=Buffer.from(privateToken()), supplied=Buffer.from(request.headers.get('x-isave-gateway')??'');
    const origin=new URL(process.env['PUBLIC_ORIGIN']!);
    if(expected.length!==supplied.length || !timingSafeEqual(expected,supplied) || request.headers.get('x-isave-proto')!=='https' ||
       !isIP(request.headers.get('x-isave-client-ip')??'') || request.headers.get('host')!==origin.host)throw new Error();
    const input=new URL(request.url);
    const init:RequestInit & {duplex:'half'}={method:request.method,headers:new Headers(request.headers),duplex:'half'};
    if(!['GET','HEAD'].includes(request.method))init.body=request.body;
    init.headers = new Headers(init.headers);
    (init.headers as Headers).delete('x-isave-gateway');
    canonical=new Request(new URL(input.pathname+input.search,origin),init);
  } catch {
    return new Response('Trusted HTTPS gateway required.',{status:403,headers:{'Cache-Control':'no-store'}});
  }
  return requests.run(canonical,()=>run(canonical));
}

export function backendFetch(input:string|URL,init:RequestInit={}) {
  if(!hosted())return fetch(input,init);
  const target=new URL(input);
  const headers=new Headers(init.headers);
  for(const key of [...headers.keys()])if(/^(x-forwarded|forwarded|x-isave-(gateway|client-ip|proto))/i.test(key))headers.delete(key);
  if(hosted()) {
    const request=requests.getStore();
    if(!request || target.origin!==process.env['AUTH_API_ORIGIN'])throw new Error('Private transport context unavailable');
    headers.set('x-isave-gateway',privateToken());
    headers.set('x-isave-client-ip',request.headers.get('x-isave-client-ip')!);
    headers.set('x-isave-proto','https');
  }
  return fetch(target,{...init,headers,redirect:'error'});
}
