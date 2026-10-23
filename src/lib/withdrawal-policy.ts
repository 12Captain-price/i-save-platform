export const withdrawalPolicyLabels = {
  withdrawal_mode: "Full or partial withdrawal policy",
  withdrawal_limits: "Withdrawal amount-limit policy",
  withdrawal_usd_min: "USD minimum (optional under bounded policy)",
  withdrawal_usd_max: "USD maximum (required under bounded policy)",
  withdrawal_zwg_min: "ZiG minimum (optional under bounded policy)",
  withdrawal_zwg_max: "ZiG maximum (required under bounded policy)",
  withdrawal_methods: "Approved manual payout methods",
  withdrawal_approval_levels: "Required approval levels (1 or 2 distinct reviewers)",
  withdrawal_separation: "Withdrawal separation of duties",
  withdrawal_cancellation: "Supported cancellation policy",
  withdrawal_failure: "Uncertain/not-paid evidence handling",
};
export const withdrawalOptions:Record<string,[string,string][]>= {
 withdrawal_mode:[['full_only','Full balance only'],['full_or_partial','Full or partial amounts']],
 withdrawal_limits:[['no_limits','Explicitly approved: no amount limits'],['bounded','Currency-specific amount limits']],
 withdrawal_methods:[['cash_only','Manual office cash only'],['bank_only','Manual bank-payment evidence only (no provider transfer)'],['cash_and_bank','Both supported manual methods']],
 withdrawal_approval_levels:[['1','One approval'],['2','Two distinct authorised approvals']],
 withdrawal_separation:[['distinct_all','Approvers, processor and verifier distinct'],['processor_verifier_separate','Processor and verifier distinct'],['same_actor_allowed','Same employee with each permission (explicit approval required)']],
 withdrawal_cancellation:[['before_processing_only','Cancellation/rejection only before processing']],
 withdrawal_failure:[['evidence_review_before_release','Authorised evidence review before releasing unpaid/uncertain funds']],
};

export function withdrawalPolicyValue(key:string,value:unknown):string {
  if(value===null||value===undefined||value==='')return 'Decision not approved';
  if(withdrawalOptions[key])return withdrawalOptions[key].find(([code])=>code===String(value))?.[1]??'Unsupported saved decision - authorised review required';
  if(/^withdrawal_(usd|zwg)_(min|max)$/.test(key)){
    if(typeof value!=='string'&&typeof value!=='number')return 'Invalid saved amount - authorised review required';
    const match=String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if(!match)return 'Invalid saved amount - authorised review required';
    return `${key.includes('_usd_')?'USD':'ZiG'} ${match[1]}.${(match[2]??'').padEnd(2,'0')}`;
  }
  return 'Unsupported saved decision - authorised review required';
}

export function payoutMethodLabel(value:string):string {
  return ({manual_cash:'Manual office cash',manual_bank_record:'Manually recorded bank payout (no transfer integration)'} as Record<string,string>)[value]??'Unsupported saved payout method - authorised review required';
}
