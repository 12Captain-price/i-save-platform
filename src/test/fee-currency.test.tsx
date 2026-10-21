import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {FeeRateSettings} from '@/components/portal/FeeRateSettings';
import {FeeQuoteDetails} from '@/components/portal/FeeQuote';
import {MembershipReview,MemberFees} from '@/components/portal/MembershipReview';
const auth=vi.hoisted(()=>({identity:{permissions:['settings:read','settings:write','settings:publish','registration-fees:record','registration-fees:verify']},refresh:vi.fn()}));
vi.mock('@/components/auth/AuthProvider',()=>({useAuth:()=>auth}));
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:React.ReactNode})=><span>{children}</span>}));
afterEach(()=>vi.unstubAllGlobals());
const history={head_version:1,active:null,versions:[{version:1,rate:'34.00000000',source:'Management-supplied draft',actor_email:null,recorded_at:'2026-10-20T10:00:00Z'}],publications:[],rounding:'ROUND_HALF_UP; two decimal places. No savings conversion.'};
const quote={id:1,amount:'20.00',currency:'USD',payment_options:[{amount:'20.00',currency:'USD'},{amount:'680.00',currency:'ZWG'}],rate:{version:1,per_usd:'34.00000000',source:'Published synthetic source',effective_at:'2026-10-20T10:00:00Z'},rounding:'ROUND_HALF_UP_2DP',conversion_unavailable:null};

it('shows the management rate as unpublished without offering an effective rate',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(history)));render(<FeeRateSettings/>);
 await screen.findByText(/No effective published rate/);
 expect(screen.getByRole('button',{name:'Publish saved rate'})).toBeEnabled();
 expect(screen.getByText(/Version 1 · 34.00000000 ZiG per USD · Unpublished draft/)).toBeInTheDocument();
});
it('retains the exact publication request for retry after a lost response',async()=>{
 const bodies:string[]=[];
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(_url:string,init?:RequestInit)=>{if(init?.method==='POST'){bodies.push(String(init.body));throw new TypeError('Failed to fetch');}return Response.json(history);}));
 render(<FeeRateSettings/>);fireEvent.click(await screen.findByRole('button',{name:'Publish saved rate'}));
 await screen.findByRole('alert');expect(screen.getByLabelText('ZiG per USD')).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Retry same rate publication'}));await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[1]).toBe(bodies[0]);
});
it('separates effective, scheduled and superseded status from unchanged historical sources',async()=>{
 const oldSource='Management-supplied: 34 ZiG per USD. Draft awaiting explicit publication.';
 const versions=[{...history.versions[0]!,version:3,rate:'36'},{...history.versions[0]!,version:2,rate:'35'},{...history.versions[0]!,source:oldSource}];
 const publications=[{version:3,effective_at:'2099-01-01T00:00:00Z',published_by:'synthetic@example.test',published_at:'2020-01-01T00:00:00Z'},{version:2,effective_at:'2020-01-02T00:00:00Z',published_by:'synthetic@example.test',published_at:'2020-01-01T00:00:00Z'},{version:1,effective_at:'2020-01-01T00:00:00Z',published_by:'synthetic@example.test',published_at:'2020-01-01T00:00:00Z'}];
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...history,head_version:3,active:versions[1],versions,publications})));
 render(<FeeRateSettings/>);
 await screen.findByText(/Version 3.*Scheduled/);
 expect(screen.getByText(/Version 2.*Effective/)).toBeInTheDocument();
 expect(screen.getByText(/Version 1.*Superseded/)).toBeInTheDocument();
 expect(screen.getByText('Original source (unchanged): '+oldSource)).toBeInTheDocument();
 expect(screen.getByText(/Historical source wording is retained verbatim/)).toBeInTheDocument();
});
it('does not invent a conversion when a frozen obligation captured no rate',()=>{
 render(<FeeQuoteDetails quote={{...quote,payment_options:[quote.payment_options[0]!],rate:null,conversion_unavailable:'No effective rate at creation.'}}/>);
 expect(screen.getByText('No effective rate at creation.')).toBeInTheDocument();expect(document.body.textContent).not.toContain('680');
});
it('records the exact server-provided ZiG amount rather than converting in the browser',async()=>{
 const workflow={fee_policy:{amount:'20.00',currency:'USD'},fee_obligation:quote,payment:null,approval:null,approval_blockers:['Verification required'],can_approve:false,can_verify:false,acknowledgement:{acknowledgement:'Review verified fee',acknowledgement_version:'v1'},delivery:{available:false,status:'Not issued'}};
 const fetcher=vi.fn().mockImplementation(async(_url:string,init?:RequestInit)=>Response.json(init?.method==='POST'?{completed:true}:workflow));vi.stubGlobal('fetch',fetcher);
 render(<MembershipReview id={1} onChange={()=>{}}/>);await screen.findByLabelText('Payment currency');
 fireEvent.change(screen.getByLabelText('Payment currency'),{target:{value:'ZWG'}});
 fireEvent.change(screen.getByLabelText('Receipt / payment reference'),{target:{value:'Synthetic-quote'}});
 fireEvent.change(screen.getByLabelText('Payment date'),{target:{value:'2026-01-01'}});
 fireEvent.click(screen.getByRole('button',{name:'Record ZiG 680 payment'}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledWith('/api/membership/applications/1/payment',expect.objectContaining({body:JSON.stringify({amount:'680.00',currency:'ZWG',payment_date:'2026-01-01',reference:'Synthetic-quote'})})));
});
it('keeps nominal fees separate from actual ZiG settlement in member Fees',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({registration_fees:[{amount:'20.00',currency:'USD',status:'Paid',reference:'Synthetic-ZiG',payment_date:'2026-01-01',payment_amount:'680.00',payment_currency:'ZWG',obligation:quote}],subscriptions:[]})));
 render(<MemberFees/>);await screen.findByText('Registration fee — US$20 — Paid');expect(screen.getByText('Actual payment: ZiG 680.00')).toBeInTheDocument();expect(document.body.textContent).toContain('No savings conversion');
});
