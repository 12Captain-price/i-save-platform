import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function LaunchAvailability({children,kind,admin=false}:{children:ReactNode;kind:'registration'|'documents'|'financial'|'workspace';admin?:boolean}) {
  const [mode,setMode]=useState<string|null>(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setFailed(false);setMode(null);
    fetch('/api/public/availability',{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new Error();const data=await r.json();
      if(!['informational','applications','full'].includes(data.mode))throw new Error();
      if(active)setMode(data.mode);
    }).catch(()=>{if(active)setFailed(true)});return()=>{active=false};
  },[attempt]);
  if(failed)return <section role="alert" className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6"><h2 className="text-xl font-semibold">Availability could not be checked</h2><p className="my-4">Your details have not been submitted. Retry safely or contact the office.</p><Button onClick={()=>setAttempt(x=>x+1)}>Retry availability check</Button></section>;
  if(mode===null)return <p role="status" className="p-6">Checking service availability…</p>;
  const available=mode==='full'||(['registration','documents'].includes(kind)&&mode==='applications')||(kind==='workspace'&&(admin||mode==='applications'));
  if(!available)return <section role="status" className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6"><h2 className="text-xl font-semibold">This service is currently unavailable</h2><p className="my-4">{kind==='registration'?'Registration is not open at the moment. Contact the office for help.':kind==='documents'?'Document updates and review are currently unavailable. Existing evidence has not been changed.':kind==='financial'?'Financial actions are not available at the moment. Your existing records have not been changed.':'This service is not available at the moment. You can use the navigation or sign out.'}</p><a className="text-primary underline" href="/contact">Contact the office</a></section>;
  return <>{mode!=='full'&&<p role="status" className="mb-5 rounded-xl border border-primary/30 p-4">{admin?`Restricted launch mode: ${mode}. Financial processing is unavailable. Administrative access does not override permissions or policy checks.`:'Financial processing is currently unavailable.'}</p>}{children}</>;
}
