import { FeeRateSettings } from './FeeRateSettings';
import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Feedback, useRecords } from './AdminDataScreens';

export const settingLabels = {
  office:'Office address',email:'Public email',office_phone:'Office landline',director_phone:'Director phone',additional_phone:'Additional contact phone',
  registration_amount:'Registration-fee amount',registration_currency:'Registration-fee currency',
  subscription_amount:'Monthly subscription amount',subscription_currency:'Subscription currency',subscription_start:'Subscription start rule',
  subscription_due_day:'Subscription due day (optional)',review_acknowledgement:'Required reviewer acknowledgement wording',
};
type Key=keyof typeof settingLabels;
type Terms=Record<Key,string|number|null>;
type Version={version:number;terms:Terms;missing_decisions:Key[];actor_email:string|null;recorded_at:string};
type Publication={version:number;effective_at:string;actor_email:string|null;recorded_at:string};
type State={head_version:number;active_version:number;active_terms:Terms;versions:Version[];publications:Publication[];impacts:Record<string,string>;unsupported:string[];preview:null|{version:number;blockers:string[];changes:Partial<Record<Key,{from:string|number|null;to:string|number|null}>>}};
const fieldClass='mt-2 w-full min-w-0 rounded-md border border-input bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const show=(v:string|number|null)=>v===null?'Not configured':String(v);
export function OrganisationSettings() {
  const {identity}=useAuth();
  if (!identity?.permissions.includes('settings:read')) return <section role="alert">Access denied. Organisation settings read permission is required.</section>;
  return <><SettingsData/><FeeRateSettings/></>;
}
function SettingsData() {
  const [notice,setNotice]=useState('');
  const result=useRecords<State>('/api/admin/organisation-settings');
  if(result.error)return <Feedback {...result}/>;
  if(!result.data)return <p role="status">Loading organisation settings…</p>;
  return <>{notice&&<p role="status" className="mb-5">{notice}</p>}<SettingsEditor key={result.data.head_version} data={result.data} reload={result.reload} published={message=>{setNotice(message);result.reload();}}/></>;
}
function SettingsEditor({data,reload,published:onPublished}:{data:State;reload:()=>void;published:(message:string)=>void}) {
  const auth=useAuth(); const has=(code:string)=>auth.identity?.permissions.includes(code);
  const initial=data.versions[0]?.terms??data.active_terms;
  const [terms,setTerms]=useState<Terms>(initial);
  const [effective,setEffective]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [pending,setPending]=useState<{action:'save'|'publish';body:object}|null>(null);
  const dirty=JSON.stringify(terms)!==JSON.stringify(initial);
  const preview=data.preview;
  const published=data.publications.some(p=>p.version===data.head_version);
  async function act(action:'save'|'publish') {
    const request=pending??{action,body:action==='save'?{request_key:crypto.randomUUID(),base_version:data.head_version,terms}:{request_key:crypto.randomUUID(),version_id:data.head_version,effective_at:effective?new Date(effective).toISOString():null}};
    setPending(request);setBusy(true);setError('');setNotice('');
    try {
      const response=await fetch('/api/admin/organisation-settings'+(request.action==='publish'?'/publish':''),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Isave-Request':'1'},body:JSON.stringify(request.body)});
      if(response.status===401){await auth.refresh();throw new Error('Your session expired. Please log in again.');}
      const result=await response.json();
      if(!response.ok){if([400,403,409].includes(response.status))setPending(null);throw new Error(result.error??'Request could not be confirmed. Retry the same request.');}
      setPending(null);
      if(request.action==='save')reload();
      else {onPublished('Saved version published for '+new Date(result.effective_at).toLocaleString()+'. Existing records are unchanged.');}
    } catch(e){setError(e instanceof Error && !(e instanceof TypeError)?e.message:'Request could not be confirmed. Retry the same request before editing.');}
    finally{setBusy(false);}
  }
  return <div className="space-y-6"><section className="rounded-xl border border-primary/25 bg-primary/5 p-5 sm:p-7"><h2 className="text-xl font-semibold">Organisation settings</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Effective published version: {data.active_version || 'Preserved baseline'}. Drafts do not change working features. Publication affects the future records described below; existing payments, obligations and accepted wording are retained.</p></section>
    <Button variant="outline" onClick={reload} disabled={busy}>Reload settings (discard unsaved edits)</Button>
    <form className="space-y-6 rounded-xl border border-border bg-card p-5 sm:p-8" onSubmit={e=>{e.preventDefault();void act('save');}}><h2 className="text-xl font-semibold">Edit a draft</h2><p className="text-sm text-muted-foreground">Current saved head: version {data.head_version}. Incomplete drafts are allowed. Clear undecided fields; publication requires the working contact, fee, start and review fields. The optional due day may remain unset.</p>
      <fieldset disabled={!has('settings:write')||busy||pending!==null} className="grid min-w-0 gap-5 sm:grid-cols-2"><legend className="sr-only">Business settings draft</legend>{(Object.keys(settingLabels) as Key[]).map(key=><div key={key} className={`min-w-0 ${['office','review_acknowledgement'].includes(key)?'sm:col-span-2':''}`}><label htmlFor={'settings-'+key} className="text-sm font-medium">{settingLabels[key]}</label>{key==='subscription_start'?<select id={'settings-'+key} className={fieldClass} value={terms[key]??''} onChange={e=>setTerms({...terms,[key]:e.target.value||null})}><option value="">Not decided</option><option value="next_calendar_month">Calendar month following activation</option></select>:key==='review_acknowledgement'||key==='office'?<textarea id={'settings-'+key} className={fieldClass} rows={3} maxLength={key==='office'?500:2000} value={terms[key]??''} onChange={e=>setTerms({...terms,[key]:e.target.value||null})}/>:<input id={'settings-'+key} className={fieldClass} type={key.endsWith('_amount')||key==='subscription_due_day'?'number':key==='email'?'email':'text'} step={key==='subscription_due_day'?1:'0.01'} min={key==='subscription_due_day'?1:'0.01'} max={key==='subscription_due_day'?28:undefined} maxLength={key.endsWith('_currency')?3:undefined} value={terms[key]??''} onChange={e=>setTerms({...terms,[key]:e.target.value?(key==='subscription_due_day'?Number(e.target.value):key.endsWith('_currency')?e.target.value.toUpperCase():e.target.value):null})}/>}</div>)}</fieldset>
      <p className="text-xs leading-relaxed text-muted-foreground">Amounts are separate from savings. Only next-calendar-month subscription start is supported. Due days 1–28 are supported; 29–31 remain unavailable until a short-month rule is approved. Setting a due day does not enable overdue labels, penalties or billing automation. Review wording is required; the verified fee and explicit acknowledgement cannot be disabled.</p>
      {has('settings:write')&&<Button type="submit" disabled={busy||!!pending}>Save settings draft</Button>}
    </form>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{pending&&!busy&&<Button onClick={()=>void act(pending.action)}>Retry same {pending.action==='save'?'save':'publication'}</Button>}{notice&&<p role="status">{notice}</p>}
    <section aria-label="Publication preview" className="space-y-4 rounded-xl border border-primary/25 bg-card p-5 sm:p-8"><h2 className="text-xl font-semibold">Publication preview · saved version {data.head_version}</h2><p className="text-sm text-muted-foreground">This preview compares the saved version with the currently effective values. Unsaved edits are not included.</p>{dirty&&<p role="status">Save or discard your unsaved edits before publishing.</p>}
      {preview?.blockers.length ? <ul className="list-disc space-y-2 pl-5 text-sm">{preview.blockers.map(reason=><li key={reason}>{reason}</li>)}</ul>:<p className="text-sm">Required fields are configured. Review the values and their effects before publishing.</p>}
      <dl className="space-y-3">{Object.entries(preview?.changes??{}).map(([k,change])=><div key={k} className="rounded-lg border border-border p-3"><dt className="text-sm font-semibold">{settingLabels[k as Key]}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{show(change.from)} → {show(change.to)}</dd></div>)}</dl>
      {Object.entries(data.impacts).map(([k,text])=><p key={k} className="text-sm leading-relaxed text-muted-foreground">{text}</p>)}
      {has('settings:publish')&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void act('publish');}}><label htmlFor="settings-effective" className="block text-sm">Effective date and time (your local time; leave blank for immediately)</label><input id="settings-effective" type="datetime-local" className={fieldClass} value={effective} disabled={busy||!!pending} onChange={e=>setEffective(e.target.value)}/><p className="text-xs text-muted-foreground">Scheduled publications take effect in order. Backdating and insertion ahead of a scheduled publication are unavailable.</p><Button type="submit" disabled={busy||!!pending||dirty||published||!!preview?.blockers.length||!!notice}>{published?'Saved version already published':'Publish saved settings version'}</Button></form>}
    </section>
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-8"><h2 className="text-xl font-semibold">Version and publication history</h2>{data.versions.map(v=>{const publication=data.publications.find(p=>p.version===v.version);return <details key={v.version} className="rounded-lg border border-border p-4"><summary className="cursor-pointer break-words text-sm font-semibold">Version {v.version} · {publication?(v.version===data.active_version?'Effective published settings':'Published / scheduled'):'Unpublished draft'} · {v.actor_email??'Preserved migration baseline'}</summary><p className="mt-3 text-xs text-muted-foreground">Draft saved {new Date(v.recorded_at).toLocaleString()}{publication?` · Published by ${publication.actor_email??'migration'} · Effective ${new Date(publication.effective_at).toLocaleString()}`:''}</p><p className="mt-3 text-sm">{v.missing_decisions.length?`Missing decisions: ${v.missing_decisions.map(k=>settingLabels[k]).join(', ')}`:'Required fields recorded; due day may be unset.'}</p><dl className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(v.terms).map(([k,value])=><div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground">{settingLabels[k as Key]}</dt><dd className="whitespace-pre-wrap break-words text-sm">{show(value)}</dd></div>)}</dl></details>;})}</section>
    <section className="rounded-xl border border-border p-5"><h2 className="font-semibold">Unsupported here</h2><p className="mt-2 text-sm text-muted-foreground">{data.unsupported.join(' · ')}. No setting on this screen enables these workflows. Secrets, SMTP credentials and infrastructure remain outside business settings.</p></section>
  </div>;
}
