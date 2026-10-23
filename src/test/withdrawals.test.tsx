import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {Withdrawals} from '@/components/portal/Withdrawals';
import {SavingsSummary} from '@/components/portal/SavingsWorkspace';
import {handleAuthentication} from '@/lib/auth-server';
import {hararePayoutInstant} from '@/lib/withdrawal-time';
import {WithdrawalPolicySummary} from '@/components/portal/WithdrawalPolicySummary';
import {withdrawalPolicyValue} from '@/lib/withdrawal-policy';
const auth=vi.hoisted(()=>({identity:{permissions:['withdrawals:own']},refresh:vi.fn()}));
vi.mock('@/components/auth/AuthProvider',()=>({useAuth:()=>auth}));
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:React.ReactNode})=><span>{children}</span>}));
afterEach(()=>{vi.unstubAllGlobals();auth.identity.permissions=['withdrawals:own'];});
const eligibility={enrolment_id:1,currency:'USD',completion_date:'2026-10-23',eligible_by_date:true,can_request:true,blockers:[],earliest_possible_payout_at:'2026-11-06T12:00:00Z',settings_version:3,policy:{withdrawal_mode:'full_or_partial',withdrawal_separation:'recorder_separate'},notice:'Approval does not confirm payout.',confirmed:'10.00',reserved:'0.00',available:'10.00'};
it('denies missing permission without fetching any records',()=>{
 auth.identity.permissions=[];const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<Withdrawals member/>);expect(screen.getByRole('alert')).toHaveTextContent('permission');expect(fetcher).not.toHaveBeenCalled();
});
it('shows policy and completion blockers without enabling premature requests',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(path:string)=>Response.json(path.includes('eligibility')?{items:[{...eligibility,can_request:false,eligible_by_date:false,blockers:['Programme completion is required','Withdrawal decision missing: methods']}]}:{items:[],total:0})));
 render(<Withdrawals member/>);await screen.findByText('Programme completion is required');expect(screen.getByText('Withdrawal decision missing: methods')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Submit withdrawal request'})).toBeDisabled();expect(screen.getByRole('checkbox')).not.toBeChecked();expect(screen.getByText('Programme completion: 2026-10-23')).toBeInTheDocument();
});
it.each(['network','server'])('retains a %s failure and retries the same key without supplying actor identities',async(failure)=>{
 const bodies:Record<string,unknown>[]=[];const f=vi.fn().mockImplementation(async(path:string,init?:RequestInit)=>{
  if(init?.method==='POST'){bodies.push(JSON.parse(String(init.body)));if(failure==='server')return Response.json({error:'Outcome unknown'},{status:503});throw TypeError('Response lost');}
  return Response.json(path.includes('eligibility')?{items:[eligibility]}:{items:[],total:0});
 });vi.stubGlobal('fetch',f);render(<Withdrawals member/>);
 await screen.findByText('Programme completion: 2026-10-23');fireEvent.change(screen.getByLabelText('Amount in USD'),{target:{value:'5.00'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Submit withdrawal request'}));await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Retry same withdrawal request'}));await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[0]).toEqual(bodies[1]);expect(bodies[0]).not.toHaveProperty('actor_id');expect(screen.queryByText('Verified manual payout receipt')).not.toBeInTheDocument();
});
it('shows a reservation as separate from confirmed and available savings',()=>{
 render(<SavingsSummary data={{available:true,confirmed:[{currency:'USD',amount:'10.00'}],reserved:[{currency:'USD',amount:'6.00'}],available_funds:[{currency:'USD',amount:'4.00'}],pending:[],legacy_requires_review:0,message:'Fees excluded'}}/>);
 expect(screen.getByLabelText('Reserved withdrawals')).toHaveTextContent('USD 6.00 reserved');expect(screen.getByLabelText('Available savings')).toHaveTextContent('USD 4.00 available');expect(screen.getByText('USD 10.00')).toBeInTheDocument();
});
it('member sees uncertain status without office verification or a false receipt',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(path:string)=>Response.json(path.includes('eligibility')?{items:[]}:{items:[{id:1,enrolment_id:1,amount:'5.00',currency:'USD',status:'Uncertain',completion_date:'2026-10-23',requested_at:'2026-10-23T12:00:00Z',notice_ends_at:'2026-11-06T12:00:00Z',settings_version:3,base_event_id:2,policy:{},receipt_available:false,notice:'Uncertain funds stay reserved',history:[],payout:null,debit:null}],total:1})));
 render(<Withdrawals member/>);await screen.findByText('Withdrawal 1 - USD 5.00 - Uncertain');expect(screen.queryByLabelText('Action')).not.toBeInTheDocument();expect(screen.queryByText('Verified manual payout receipt')).not.toBeInTheDocument();
});
it('withdrawal bridge denies anonymous access and cross-origin writes without forwarding',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);const read=await handleAuthentication(new Request('http://localhost:3000/api/withdrawals'));expect(read?.status).toBe(401);expect(f).not.toHaveBeenCalled();
 const write=await handleAuthentication(new Request('http://localhost:3000/api/withdrawals',{method:'POST',headers:{Origin:'http://attacker.test','X-Isave-Request':'1','Content-Type':'application/json',Cookie:'isave_session='+'x'.repeat(43)},body:'{}'}));expect([401,403]).toContain(write?.status);expect(f).not.toHaveBeenCalled();
});
it.each([
 ['2026-10-23T01:06','2026-10-22T23:06:00.000Z'],
 ['2026-10-23T00:47:44','2026-10-22T22:47:44.000Z'],
 ['2024-02-29T00:00','2024-02-28T22:00:00.000Z'],
])('converts explicit Harare payout time %s without browser-local parsing',(value,expected)=>{
 expect(hararePayoutInstant(value)).toBe(expected);
});
it.each(['','2026-02-30T01:06','2026-10-23T25:00','2026-10-23T01:06Z'])('rejects invalid or ambiguous office time %s',value=>{
 expect(()=>hararePayoutInstant(value)).toThrow('valid payout date and time in Harare');
});
it('renders saved withdrawal policy as readable decisions and retains exact acknowledgement wording',()=>{
 render(<WithdrawalPolicySummary policy={{withdrawal_mode:'full_or_partial',withdrawal_limits:'no_limits',withdrawal_methods:'cash_only',withdrawal_approval_levels:1,withdrawal_separation:'same_actor_allowed',withdrawal_cancellation:'before_processing_only',withdrawal_failure:'evidence_review_before_release',request_acknowledgement:'Exact TEST ONLY acknowledgement.',request_acknowledgement_version:'withdrawal-request-v1'}}/>);
 expect(screen.getByText('Full or partial amounts')).toBeInTheDocument();expect(screen.getByText('Manual office cash only')).toBeInTheDocument();expect(screen.getByText('One approval')).toBeInTheDocument();expect(screen.getByText('Same employee with each permission (explicit approval required)')).toBeInTheDocument();expect(screen.getByText('Exact TEST ONLY acknowledgement.')).toBeInTheDocument();
 expect(screen.getByLabelText('Withdrawal policy decisions').textContent).not.toMatch(/withdrawal_|same_actor_allowed|cash_only/);
});
it('keeps missing and unsupported policy decisions explicit without inventing limits',()=>{
 render(<WithdrawalPolicySummary policy={{withdrawal_limits:'bounded',withdrawal_usd_max:'25.5',withdrawal_separation:'unrecognised_value'}}/>);
 expect(screen.getByText('USD 25.50')).toBeInTheDocument();expect(screen.getAllByText('Decision not approved').length).toBeGreaterThan(0);expect(screen.getAllByText('No minimum configured.')).toHaveLength(2);expect(screen.getByText('Unsupported saved decision - authorised review required')).toBeInTheDocument();expect(screen.queryByText('Full or partial amounts')).not.toBeInTheDocument();
});
it('formats both currency limits without converting or rounding unsupported values',()=>{
 expect(withdrawalPolicyValue('withdrawal_zwg_max','850.00')).toBe('ZiG 850.00');expect(withdrawalPolicyValue('withdrawal_usd_min',null)).toBe('Decision not approved');expect(withdrawalPolicyValue('withdrawal_usd_max','2.345')).toBe('Invalid saved amount - authorised review required');
});
