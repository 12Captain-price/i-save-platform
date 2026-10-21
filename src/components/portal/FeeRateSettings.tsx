import {useState} from 'react';
import {useAuth} from '@/components/auth/AuthProvider';
import {Button} from '@/components/ui/button';
import {useRecords,Feedback} from './AdminDataScreens';
type Version={version:number;rate:string;source:string;actor_email:string|null;recorded_at:string};
type History={head_version:number;active:Version|null;versions:Version[];publications:{version:number;effective_at:string;published_by:string;published_at:string}[];rounding:string};
export function FeeRateSettings(){
 const result=useRecords<History>('/api/admin/fee-rates');
 if(result.error)return <Feedback {...result}/>;
 if(!result.data)return <p role="status">Loading fee exchange-rate history…</p>;
 return <RateEditor key={result.data.head_version+':'+result.data.publications.length} data={result.data} reload={result.reload}/>;
}
function RateEditor({data,reload}:{data:History;reload:()=>void}){
 const auth=useAuth(),head=data.versions[0];
 const [rate,setRate]=useState(head?.rate??''),[source,setSource]=useState(head?.source??''),[effective,setEffective]=useState('');
 const [pending,setPending]=useState<{action:'save'|'publish';body:object}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dirty=rate!==head?.rate||source!==head?.source;
 const has=(code:string)=>auth.identity?.permissions.includes(code);
 async function act(action:'save'|'publish'){
  const request=pending??{action,body:action==='save'?{request_key:crypto.randomUUID(),base_version:data.head_version,rate,source}:{request_key:crypto.randomUUID(),version_id:data.head_version,effective_at:effective?new Date(effective).toISOString():null}};
  setPending(request);setBusy(true);setError('');
  try{
   const response=await fetch('/api/admin/fee-rates'+(request.action==='publish'?'/publish':''),{method:'POST',headers:{'Content-Type':'application/json','X-Isave-Request':'1'},body:JSON.stringify(request.body)});
   if(response.status===401){await auth.refresh();throw new Error('Your session expired. Log in again.');}
   const body=await response.json();if(!response.ok){if([400,403,409].includes(response.status))setPending(null);throw new Error(body.error??'Rate action could not be confirmed. Retry the same request.');}
   reload();
  }catch(e){setError(e instanceof Error&&!(e instanceof TypeError)?e.message:'Rate action could not be confirmed. Retry the same request before editing.');}
  finally{setBusy(false);}
 }
 return <section aria-label="USD to ZiG fee rates" className="mt-8 space-y-5 rounded-xl border border-primary/25 bg-card p-5 sm:p-8"><h2 className="text-xl font-semibold">USD-to-ZiG fee rates</h2>
  <p className="text-sm text-muted-foreground">{data.active?`Effective published rate: ${data.active.rate} ZiG per USD (version ${data.active.version}).`:'No effective published rate. USD settlement remains available; ZiG conversion is unavailable.'}</p>
  <p className="text-sm text-muted-foreground">Saving a rate does not publish it. Publication status is shown separately from the original source evidence. New obligations capture an effective rate at creation; existing obligations and payments never revalue. Rates do not convert savings.</p>
  <Button variant="outline" disabled={busy} onClick={reload}>Reload rates (discard unsaved edits)</Button>
  {has('settings:write')&&<form className="grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void act('save');}}><fieldset disabled={busy||!!pending} className="contents"><legend className="sr-only">Rate draft</legend><label className="text-sm">ZiG per USD<input aria-label="ZiG per USD" className="mt-2 w-full rounded-md border border-input bg-background px-3 py-3" type="number" min="0.00000001" step="0.00000001" required value={rate} onChange={e=>setRate(e.target.value)}/></label><label className="text-sm">Rate source<input aria-label="Rate source" className="mt-2 w-full rounded-md border border-input bg-background px-3 py-3" required maxLength={500} value={source} onChange={e=>setSource(e.target.value)}/></label></fieldset><Button type="submit" disabled={busy||!!pending} className="sm:justify-self-start">Save rate draft</Button></form>}
  {has('settings:publish')&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void act('publish');}}><h3 className="font-semibold">Rate publication preview</h3><p className="break-words text-sm">Saved version {head?.version}: {head?.rate} ZiG per USD. Source: {head?.source}. This affects only obligations created after the rate becomes effective.</p><label className="block text-sm">Rate effective date (local time; blank means immediately)<input aria-label="Rate effective date (local time; blank means immediately)" type="datetime-local" className="mt-2 w-full min-w-0 rounded-md border border-input bg-background px-3 py-3" value={effective} disabled={busy||!!pending} onChange={e=>setEffective(e.target.value)}/></label><p className="text-xs text-muted-foreground">{data.rounding} Backdating and publication cancellation are unavailable.</p><Button type="submit" disabled={busy||!!pending||dirty||!head||data.publications.some(p=>p.version===data.head_version)}>Publish saved rate</Button></form>}
  {error&&<p role="alert">{error}</p>}{pending&&!busy&&<Button onClick={()=>void act(pending.action)}>Retry same rate {pending.action==='save'?'save':'publication'}</Button>}
  <p className="text-xs text-muted-foreground">Historical source wording is retained verbatim and may describe an earlier draft state. Use the status and effective date to determine publication.</p><h3 className="font-semibold">Rate version history</h3>{data.versions.map(v=>{const pub=data.publications.find(p=>p.version===v.version);return <article key={v.version} className="rounded-lg border border-border p-4 text-sm"><p>Version {v.version} · {v.rate} ZiG per USD · {!pub?'Unpublished draft':new Date(pub.effective_at).getTime()>Date.now()?'Scheduled':data.active?.version===v.version?'Effective':'Superseded'}</p><p className="mt-2 break-words">Original source (unchanged): {v.source}</p><p className="mt-2 break-words text-xs text-muted-foreground">Draft by {v.actor_email??'Management-supplied migration seed; no staff actor'} · {new Date(v.recorded_at).toLocaleString()}</p>{pub&&<p className="mt-2 break-words text-xs text-muted-foreground">Published by {pub.published_by} · Effective {new Date(pub.effective_at).toLocaleString()}</p>}</article>;})}
 </section>;
}
