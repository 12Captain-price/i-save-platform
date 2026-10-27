// Shared by the server boundary and Node's --import startup preload.
import { readFileSync } from 'node:fs';
export const hosted = () => process.env.ISAVE_ENV === 'production';
export function privateToken() {
  const file=process.env.GATEWAY_TOKEN_FILE;
  return file?readFileSync(file,'utf8').trim():process.env.GATEWAY_TOKEN??'';
}
export function validateHostedConfiguration() {
  if(process.env.ISAVE_ENV&&!['development','production'].includes(process.env.ISAVE_ENV))throw new Error('Invalid frontend environment');
  if(!hosted())return;
  try {
    const origin=new URL(process.env.PUBLIC_ORIGIN??''),token=privateToken();
    const hostname=origin.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
    if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||
      ['localhost','::1'].includes(hostname)||/^127\.|^::ffff:127\./.test(hostname)||/\.(test|localhost|invalid)$/.test(hostname)||
      origin.origin!==process.env.PUBLIC_ORIGIN||
      process.env.AUTH_API_ORIGIN!=='http://backend:8000'||!/^[-A-Za-z0-9_]{32,128}$/.test(token)||/change.?me|dev-secret/i.test(token))throw new Error();
  }catch{throw new Error('Unsafe hosted frontend configuration; consult deployment runbook');}
}
validateHostedConfiguration();
