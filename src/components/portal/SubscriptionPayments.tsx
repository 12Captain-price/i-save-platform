import {SubscriptionGeneration} from './FinancialOperations';
import {useState} from 'react';
import {useAuth} from '@/components/auth/AuthProvider';
import {Button} from '@/components/ui/button';
import {useRecords,Feedback} from './AdminDataScreens';
import {FeeQuoteDetails,feeMoney,type FeeQuote} from './FeeQuote';
type Row={id:number;member_number:string;member_name:string;period_month:string;amount:string;currency:string;status:string;payment_status?:string;due_date?:string|null;obligation:FeeQuote|null;payment:null|{amount:string;currency:string;reference:string;payment_date:string;recorded_by:string;recorded_at:string;verified_by:string|null;verified_at:string|null}};
export function SubscriptionPayments(){
 const {identity}=useAuth();
 return identity?.permissions.includes('subscriptions:read')?<Directory/>:<p role="alert">Access denied. Subscription review permission is required.</p>;
}
function Directory(){
 const [skip,setSkip]=useState(0),[revision,setRevision]=useState(0),[q,setQ]=useState(''),[status,setStatus]=useState(''),[search,setSearch]=useState('');
 const result=useRecords<{total:number;items:Row[]}>(`/api/membership/subscriptions?skip=${skip}&limit=10&q=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
 if(result.error)return <Feedback {...result}/>;
 return <section className="space-y-5"><SubscriptionGeneration onCreated={result.reload}/><form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();setSearch(q);setSkip(0);}}><label>Search member, month or payment reference<input className="block rounded-md border border-input bg-background p-3" value={q} onChange={e=>setQ(e.target.value)}/></label><label>Payment status<select className="block rounded-md border border-input bg-background p-3" value={status} onChange={e=>{setStatus(e.target.value);setSkip(0);}}><option value="">All statuses</option><option>Unpaid</option><option>Pending verification</option><option>Paid</option></select></label><Button type="submit">Search subscriptions</Button></form><h2 className="text-xl font-semibold">Subscription fee payments</h2><p className="text-sm text-muted-foreground">Record an actual office payment, then verify it separately. Full settlement only. The original obligation remains unchanged; fees never become savings. Partial/advance payments, waivers and refunds remain unavailable.</p><Button variant="outline" onClick={()=>{setRevision(v=>v+1);result.reload();}}>Refresh subscription payments</Button>{!result.data?<p role="status">Loading subscriptions…</p>:<>{!result.data.items.length&&<p>No subscription obligations on this page.</p>}{result.data.items.map(row=><Payment key={row.id+':'+revision} row={row} reload={result.reload}/>)}<nav aria-label="Subscription pages" className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={skip===0} onClick={()=>setSkip(Math.max(0,skip-10))}>Previous</Button><span className="text-sm">{result.data.total} obligations · Page {skip/10+1}</span><Button variant="outline" disabled={skip+10>=result.data.total} onClick={()=>setSkip(skip+10)}>Next</Button></nav></>}</section>;
}
function Payment({row,reload}:{row:Row;reload:()=>void}){
 const auth=useAuth(),options=row.obligation?.payment_options??[{currency:row.currency,amount:row.amount}];
 const [currency,setCurrency]=useState(options[0]!.currency),[reference,setReference]=useState(''),[date,setDate]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const selected=options.find(o=>o.currency===currency)!;
 const has=(code:string)=>auth.identity?.permissions.includes(code);
 async function act(action:'payment'|'verify'){
  setBusy(true);setError('');
  try{
   const response=await fetch(`/api/membership/subscriptions/${row.id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json','X-Isave-Request':'1'},body:JSON.stringify(action==='payment'?{amount:selected.amount,currency:selected.currency,reference,payment_date:date}:{})});
   if(response.status===401)await auth.refresh();
   const data=await response.json();if(!response.ok)throw new Error(data.error??'Could not confirm the payment action. Refresh before retrying.');
   reload();
  }catch(e){setError(e instanceof Error&&!(e instanceof TypeError)?e.message:'Action could not be confirmed. Refresh its status before retrying; entered values are preserved.');}
  finally{setBusy(false);}
 }
 return <article aria-label={`Subscription ${row.id}`} className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-7"><h3 className="break-words font-semibold">{row.member_name} · {row.member_number} · {row.period_month}</h3><p className="text-sm">{feeMoney(row.amount,row.currency)} · {row.payment_status??row.status}</p><p className="text-sm">{row.due_date?`Due date: ${row.due_date}`:"Due day not configured."}</p><FeeQuoteDetails quote={row.obligation}/>{error&&<p role="alert">{error}</p>}
  {row.payment?<div className="space-y-2 break-words text-sm"><p>Actual payment: {feeMoney(row.payment.amount,row.payment.currency)} · {row.payment.reference} · {row.payment.payment_date}</p><p>Recorded by {row.payment.recorded_by} · {new Date(row.payment.recorded_at).toLocaleString()}</p><p>{row.payment.verified_at?`Verified by ${row.payment.verified_by} · ${new Date(row.payment.verified_at).toLocaleString()}`:'Recorded — awaiting verification'}</p>{!row.payment.verified_at&&has('subscription-fees:verify')&&<Button disabled={busy} onClick={()=>void act('verify')}>Verify subscription payment</Button>}</div>:row.status==='Pending'&&has('subscription-fees:record')&&<form className="grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void act('payment');}}><fieldset disabled={busy} className="contents"><legend className="sr-only">Record actual subscription payment</legend><label className="text-sm">Settlement currency<select aria-label={`Settlement currency for subscription ${row.id}`} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-3" value={currency} onChange={e=>setCurrency(e.target.value)}>{options.map(o=><option key={o.currency} value={o.currency}>{feeMoney(o.amount,o.currency)}</option>)}</select></label><label className="text-sm">Payment date<input aria-label={`Payment date for subscription ${row.id}`} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-3" type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label className="text-sm sm:col-span-2">Receipt/reference<input aria-label={`Receipt/reference for subscription ${row.id}`} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-3" required maxLength={80} value={reference} onChange={e=>setReference(e.target.value)}/></label></fieldset><p className="text-sm sm:col-span-2">Exact full payment: {feeMoney(selected.amount,selected.currency)}.</p><Button type="submit" disabled={busy} className="sm:justify-self-start">Record subscription payment</Button></form>}
 </article>;
}
