import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Feedback, useRecords } from './AdminDataScreens';
import {FeeQuoteDetails,feeMoney,type FeeQuote} from './FeeQuote';

type Workflow = {
  fee_obligation?:FeeQuote|null;
  payment: null | { amount:string;currency:string;reference:string;payment_date:string;recorded_by:string;recorded_at:string;verified_by:string|null;verified_at:string|null;status:string };
  approval: null | { approved_by:string;approved_at:string;acknowledgement_version:string;acknowledgement_text:string;activated_at:string|null;activated_by:string|null;subscription_start_month:string|null };
  fee_policy:{amount:string;currency:string;settings_version:number};
  can_approve:boolean;approval_blockers:string[];can_verify:boolean;
  acknowledgement:{acknowledgement:string;acknowledgement_version:string};
  delivery:{available:boolean;mode?:string;status:string;provider_message_id:string|null;expires_at:string|null};
};
const stamp = (s:string) => new Date(s).toLocaleString('en-GB',{timeZone:'Africa/Harare'})+' CAT';

export function MembershipReview({id,onChange}:{id:number;onChange:()=>void}) {
  const {identity,refresh} = useAuth();
  const result = useRecords<Workflow>(`/api/membership/applications/${id}`);
  const [ack,setAck] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [reference,setReference] = useState('');
  const [paymentDate,setPaymentDate] = useState('');
  const [currency,setCurrency] = useState('');
  const [requestKey,setRequestKey] = useState<string|null>(null);
  const [replace,setReplace] = useState(false);
  const has = (code:string) => identity?.permissions.includes(code) ?? false;
  async function act(action:string,body:object) {
    if (busy) return;
    setBusy(true);setError('');setNotice('');
    try {
      const response = await fetch(`/api/membership/applications/${id}/${action}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Isave-Request':'1'},body:JSON.stringify(body)});
      if (response.status===401) await refresh();
      const data = await response.json();
      if (!response.ok) {setError(data.error ?? 'Action could not be confirmed. Refresh before retrying.');return;}
      setNotice(action==='invitation'?(data.delivery==='Mailpit accepted'?'Mailpit accepted a local test email. No external email was sent.':'The email provider accepted the invitation. Inbox delivery is not guaranteed.'):'Action recorded. Review the updated details below.');
      setAck(false);result.reload();onChange();
    } catch {setError('Action could not be confirmed. Refresh to check its status before retrying. Your entered details are preserved.');}
    finally {setBusy(false);}
  }
  const w = result.data;
  if (result.error) return <Feedback {...result}/>;
  if (!w) return <p role="status">Loading membership prerequisites...</p>;
  const options=w.fee_obligation?.payment_options??[{amount:w.fee_policy.amount,currency:w.fee_policy.currency}];
  const selected=options.find(p=>p.currency===currency)??options[0]!;
  return <section aria-label="Membership approval and registration fee" className="space-y-6 rounded-xl border border-primary/25 bg-card p-5 sm:p-8">
    <div><h2 className="text-xl font-semibold">Registration fee and membership</h2><p className="mt-2 text-sm text-muted-foreground">Recording payment, verifying it, approving membership and activating the account are separate audited actions. Acknowledging a review never creates or verifies payment.</p></div>
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    <Button variant="outline" disabled={busy} onClick={()=>{setAck(false);result.reload();onChange();}}>Refresh payment and approval status</Button>
    <div className="rounded-lg border border-border p-4"><h3 className="font-semibold">Registration fee — {w.fee_policy.currency==='USD'?'US$':w.fee_policy.currency+' '}{Number(w.fee_policy.amount)}</h3>{w.payment ? <dl className="mt-3 grid gap-4 break-words text-sm sm:grid-cols-2">{[['Status',w.payment.status],['Reference',w.payment.reference],['Payment date',w.payment.payment_date],['Recorded by',w.payment.recorded_by],['Recorded at',stamp(w.payment.recorded_at)],['Verified by',w.payment.verified_by ?? 'Not verified'],['Verified at',w.payment.verified_at?stamp(w.payment.verified_at):'Not verified']].map(([k,v])=><div key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl> : <p className="mt-2 text-sm text-muted-foreground">No registration payment recorded.</p>}</div>
    <FeeQuoteDetails quote={w.fee_obligation}/>{w.payment&&<p className="text-sm">Actual payment: {feeMoney(w.payment.amount,w.payment.currency)} · {w.payment.verified_at?'Verified':'Awaiting verification'}</p>}
    {!w.payment&&!w.approval&&!w.fee_obligation&&has('registration-fees:record')&&<div className="space-y-3"><p className="text-sm text-muted-foreground">To preview ZiG settlement, first freeze an obligation with the effective published rate. This records no payment. A quote without an effective rate remains payable in its original currency only.</p><Button variant="outline" className="h-auto max-w-full whitespace-normal py-2 text-left" disabled={busy} onClick={()=>void act('obligation',{})}>Freeze fee obligation and preview payment options</Button></div>}
    {!w.payment && !w.approval && has('registration-fees:record') && <form className="grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void act('payment',{amount:selected.amount,currency:selected.currency,payment_date:paymentDate,reference});}}><label className="text-sm sm:col-span-2">Payment currency<select aria-label="Payment currency" className="mt-2 w-full rounded-md border border-input bg-background px-3 py-3" value={selected.currency} disabled={busy} onChange={e=>setCurrency(e.target.value)}>{options.map(p=><option key={p.currency} value={p.currency}>{feeMoney(p.amount,p.currency)}</option>)}</select></label><div><label htmlFor="fee-reference" className="mb-2 block text-sm">Receipt / payment reference</label><Input id="fee-reference" required maxLength={80} value={reference} onChange={e=>setReference(e.target.value)}/></div><div><label htmlFor="fee-date" className="mb-2 block text-sm">Payment date</label><Input id="fee-date" type="date" required value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></div><p className="text-sm sm:col-span-2">Exact full payment: {feeMoney(selected.amount,selected.currency)}. Recording is separate from verification.</p><Button disabled={busy} className="sm:col-span-2 sm:justify-self-start">Record {selected.currency==='ZWG'?'ZiG ':selected.currency==='USD'?'US$':selected.currency+' '}{Number(selected.amount)} payment</Button></form>}
    {w.payment && !w.payment.verified_at && <div><p className="mb-3 text-sm text-muted-foreground">Confirm the actual payment independently of the review checkbox. The recorder may also verify when authorised for both actions.</p><Button disabled={busy || !w.can_verify} onClick={()=>void act('verify',{})}>Verify {w.payment.currency==='ZWG'?'ZiG ':w.payment.currency==='USD'?'US$':w.payment.currency+' '}{Number(w.payment.amount)} payment</Button></div>}
    {!w.approval ? <div className="space-y-4 border-t border-border pt-5"><h3 className="font-semibold">Membership review</h3>{w.approval_blockers.length>0 && <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">{w.approval_blockers.map(s=><li key={s}>{s}</li>)}</ul>}<label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" checked={ack} disabled={busy || !w.can_approve} onChange={e=>setAck(e.target.checked)}/><span>{w.acknowledgement.acknowledgement}</span></label><p className="text-xs text-muted-foreground">Review wording version: {w.acknowledgement.acknowledgement_version}</p><Button disabled={busy || !w.can_approve || !ack} onClick={()=>void act('approve',{acknowledged:ack,acknowledgement_version:w.acknowledgement.acknowledgement_version})}>Approve membership</Button></div> : <div className="space-y-3 border-t border-border pt-5"><h3 className="font-semibold text-primary">Membership approved</h3><p className="break-words text-sm">By {w.approval.approved_by} · {stamp(w.approval.approved_at)}</p><p className="text-sm text-muted-foreground">{w.approval.acknowledgement_text} ({w.approval.acknowledgement_version})</p>{w.approval.activated_at ? <><h3 className="font-semibold text-primary">Account activated</h3><p className="break-words text-sm">By {w.approval.activated_by} · {stamp(w.approval.activated_at)}</p><p className="text-sm">The first subscription starts {w.approval.subscription_start_month}. Its recorded amount and due date are shown in the member Fees section. Registration fees are separate from savings.</p></> : <><p className="text-sm text-muted-foreground">The account is inactive. Activation links the existing verified fee and sets the subscription start month. No savings plan is approved.</p><Button disabled={busy || !has('membership:activate')} onClick={()=>void act('activate',{})}>Activate member account</Button></>}</div>}
    {w.approval?.activated_at && <div className="space-y-3 border-t border-border pt-5"><h3 className="font-semibold">Password setup invitation</h3><p className="text-sm">{w.delivery.status}</p>{w.delivery.mode==="mailpit" && <p role="status" className="text-sm text-primary">Mailpit local testing: messages are captured in the local inbox. No external email delivery.</p>}{w.delivery.provider_message_id && <p className="break-all text-xs text-muted-foreground">Provider reference: {w.delivery.provider_message_id}</p>}{!w.delivery.available && <p role="status" className="text-sm text-muted-foreground">Email delivery unavailable. An approved provider, sender, credentials and secure setup URL must be configured. No email has been sent by this workflow.</p>}{w.delivery.available && w.delivery.status!=='Not issued' && <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" checked={replace} onChange={e=>{setReplace(e.target.checked);setRequestKey(null);}}/><span>Create a replacement invitation. Earlier unused links will stop working. Unconfirmed attempts are never resent automatically.</span></label>}<Button disabled={busy || !w.delivery.available || !has('invitations:issue') || (w.delivery.status!=='Not issued' && !replace)} onClick={()=>{const key=requestKey??crypto.randomUUID();setRequestKey(key);void act('invitation',{request_key:key});}}>{w.delivery.mode==="mailpit" ? 'Capture password setup email locally' : 'Send password setup invitation'}</Button></div>}
    <p className="text-xs leading-relaxed text-muted-foreground">Refund handling is unavailable while policy is unresolved. No identity-document or additional eligibility requirements have been configured. Savings-plan terms and approval remain separate.</p>
  </section>;
}

type Fees = {registration_fees:{amount:string;currency:string;status:string;reference:string;payment_date:string|null;payment_amount?:string;payment_currency?:string;obligation?:FeeQuote|null}[];subscriptions:{amount:string;currency:string;period_month:string;status:string;due_date:string|null;obligation?:FeeQuote|null;payment?:{amount:string;currency:string;reference:string;payment_date:string;verified_at:string|null}|null}[]};
export function MemberFees() {
  const result=useRecords<Fees>('/api/membership/fees');
  if(result.error)return <Feedback {...result}/>;
  if(!result.data)return <p role="status">Loading fees...</p>;
  return <div className="space-y-6"><section className="rounded-xl border border-border bg-card p-5 sm:p-8"><h2 className="text-xl font-semibold">Registration fees</h2>{result.data.registration_fees.length ? <ul className="mt-4 space-y-5">{result.data.registration_fees.map(f=><li key={f.reference} className="break-words rounded-lg border border-primary/25 bg-primary/5 p-4"><h3 className="font-semibold text-primary">Registration fee — {f.currency==='USD'?'US$':f.currency+' '}{Number(f.amount)} — {f.status}</h3><p className="mt-2 text-sm">Reference: {f.reference}</p><p className="mt-2 text-sm">Payment date: {f.payment_date ?? 'Not recorded'}</p>{f.payment_amount&&f.payment_currency&&<p className="mt-2 text-sm">Actual payment: {feeMoney(f.payment_amount,f.payment_currency)}</p>}<FeeQuoteDetails quote={f.obligation}/></li>)}</ul> : <p role="status" className="mt-4 text-sm text-muted-foreground">No registration fees recorded.</p>}<p className="mt-4 text-sm text-muted-foreground">Registration fees do not increase savings.</p></section><section className="rounded-xl border border-border bg-card p-5 sm:p-8"><h2 className="text-xl font-semibold">Subscriptions</h2>{result.data.subscriptions.length ? <ul className="mt-4 space-y-4">{result.data.subscriptions.map(s=><li key={s.period_month} className="text-sm">{s.period_month} · {s.currency==='USD'?'US$':s.currency+' '}{Number(s.amount)} · {s.status}<p className="mt-1 text-muted-foreground">{s.due_date?`Due date: ${s.due_date}`:'Due day not configured.'}</p><FeeQuoteDetails quote={s.obligation}/>{s.payment&&<p className="mt-2 text-sm">Actual payment: {feeMoney(s.payment.amount,s.payment.currency)} · {s.payment.verified_at?'Verified':'Awaiting verification'} · Reference: {s.payment.reference} · Date: {s.payment.payment_date}</p>}</li>)}</ul> : <p role="status" className="mt-4 text-sm text-muted-foreground">No subscriptions recorded.</p>}<p className="mt-4 text-xs text-muted-foreground">Subscriptions begin in the calendar month following activation. Recorded due dates apply only to the obligations shown; no overdue or penalty rules are enabled.</p></section></div>;
}
