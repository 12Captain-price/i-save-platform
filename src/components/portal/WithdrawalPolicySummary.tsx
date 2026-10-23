import {withdrawalPolicyLabels,withdrawalPolicyValue} from '@/lib/withdrawal-policy';

export function WithdrawalPolicySummary({policy}:{policy:Record<string,unknown>}){
 return <div className="space-y-4">
  <dl className="grid gap-3 text-sm sm:grid-cols-2" aria-label="Withdrawal policy decisions">
   {Object.entries(withdrawalPolicyLabels).map(([key,label])=>{
    const amount=/^withdrawal_(usd|zwg)_(min|max)$/.test(key);
    let text=withdrawalPolicyValue(key,policy[key]);
    if(amount&&policy['withdrawal_limits']==='no_limits')text='Not used under the approved no-limit policy.';
    else if(amount&&key.endsWith('_min')&&policy[key]==null&&policy['withdrawal_limits']==='bounded')text='No minimum configured.';
    return <div key={key} className="min-w-0"><dt className="font-medium">{label}</dt><dd className="mt-1 break-words text-muted-foreground">{text}</dd></div>;
   })}
  </dl>
  {typeof policy['request_acknowledgement']==='string'&&<div className="space-y-2 text-sm"><p className="font-medium">Accepted request acknowledgement</p><p className="whitespace-pre-wrap break-words">{policy['request_acknowledgement']}</p>{typeof policy['request_acknowledgement_version']==='string'&&<p>Wording version: {policy['request_acknowledgement_version']}</p>}</div>}
 </div>;
}
