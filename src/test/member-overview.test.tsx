import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {MemberOverview,type MemberOverviewData} from '@/components/portal/MemberOverview';
const refresh=vi.hoisted(()=>vi.fn());
vi.mock('@/components/auth/AuthProvider',()=>({useAuth:()=>({refresh})}));
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:React.ReactNode})=><span>{children}</span>}));
afterEach(()=>{vi.unstubAllGlobals();refresh.mockClear();});
const empty:MemberOverviewData={member:null,membership:{status:'No member record linked',approved_at:null,activated_at:null,subscription_start_month:null},fees:{registration_fees:[],subscriptions:[]},registration_fee_verified:false,savings_interests:[],plan_enrolment:{available:false,notice:'An expression of interest is not an approved savings-plan enrolment.'},savings:{available:false,message:'Savings summary not available yet'},subscription_due_day:null};
it('shows a real loading state with no sample values',()=>{
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));render(<MemberOverview/>);
 expect(screen.getByRole('status')).toHaveTextContent('Loading your membership overview');expect(document.body.textContent).not.toMatch(/US\$|Tariro|Savings balance/);
});
it('shows unlinked and empty records without inventing savings or enrolments',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(empty)));render(<MemberOverview/>);
 await screen.findByText('No registration fees recorded.');expect(screen.getByText('No subscriptions recorded.')).toBeInTheDocument();expect(screen.getByText('No savings-category interest recorded.')).toBeInTheDocument();expect(screen.getByText('Savings summary not available yet')).toBeInTheDocument();expect(document.body.textContent).not.toMatch(/US\$0|Savings balance|Overdue/);
});
it('renders activated membership, actual paid fee, snapshot and following-month subscription',async()=>{
 const data:MemberOverviewData={...empty,member:{first_name:'Synthetic',last_name:'Member',member_number:'TEST-OVERVIEW'},membership:{status:'Activated',approved_at:'2026-10-19T10:00:00Z',activated_at:'2026-10-19T10:01:00Z',subscription_start_month:'2026-11'},registration_fee_verified:true,fees:{registration_fees:[{amount:'20.00',currency:'USD',status:'Paid',reference:'TEST-FEE',payment_date:'2026-10-19',verified_at:'2026-10-19T10:00:00Z'}],subscriptions:[{amount:'5.00',currency:'USD',period_month:'2026-11',status:'Pending',due_date:null}]},savings_interests:[{category:'education',category_label:'Education',purpose:'Historical purpose',notice_version:'historical-v1',notice_text:'No approved plan terms.',recorded_at:'2026-10-19T09:00:00Z'}]};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(data)));render(<MemberOverview/>);
 await screen.findByText('Activated');expect(screen.getByText('Registration fee — US$20 — Paid')).toBeInTheDocument();expect(screen.getByText('Reference: TEST-FEE')).toBeInTheDocument();expect(screen.getByText(/Subscriptions begin November 2026/)).toBeInTheDocument();expect(screen.getByText('Pending')).toBeInTheDocument();expect(screen.getByText('Education')).toBeInTheDocument();expect(document.body.textContent).toContain('historical-v1');expect(document.body.textContent).not.toMatch(/Overdue|Savings balance|Due date:/);
});
it('offers retry after an error and recovers without showing a false empty state',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(Response.json(empty));vi.stubGlobal('fetch',fetcher);render(<MemberOverview/>);
 await screen.findByRole('alert');expect(screen.queryByText('No subscriptions recorded.')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Try again'}));await screen.findByText('No subscriptions recorded.');expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([401,403])('handles session expiry/permission denial %s without exposing records',async status=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status})));render(<MemberOverview/>);
 await screen.findByRole('alert');expect(screen.queryByText('No subscriptions recorded.')).not.toBeInTheDocument();
 if(status===401)await waitFor(()=>expect(refresh).toHaveBeenCalled());else expect(screen.getByText('Access denied')).toBeInTheDocument();
});
