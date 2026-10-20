import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { afterEach,it,expect,vi } from 'vitest';
import { MembershipReview,MemberFees } from '@/components/portal/MembershipReview';
import { PasswordSetup } from '@/components/auth/PasswordSetup';
const refresh=vi.hoisted(()=>vi.fn());
vi.mock('@/components/auth/AuthProvider',()=>({useAuth:()=>({refresh,identity:{permissions:['registration-fees:record','registration-fees:verify','membership:approve','membership:activate','invitations:issue']}})}));
vi.mock('@/components/site/PublicLayout',()=>({PublicLayout:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:React.ReactNode})=><span>{children}</span>}));
afterEach(()=>vi.unstubAllGlobals());
const workflow={payment:null,approval:null,can_approve:false,can_verify:false,approval_blockers:['Verified US$20 required.'],acknowledgement:{acknowledgement:'I reviewed the verified fee.',acknowledgement_version:'v1'},delivery:{available:false,status:'Not issued'}};
it('keeps approval and acknowledgement disabled when backend prerequisites fail',async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json(workflow));vi.stubGlobal('fetch',fetcher);
 render(<MembershipReview id={1} onChange={()=>{}}/>);
 expect(await screen.findByRole('button',{name:'Approve membership'})).toBeDisabled();
 expect(screen.getByRole('checkbox')).not.toBeChecked();expect(screen.getByRole('checkbox')).toBeDisabled();
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('labels local capture and requires an explicit replacement without repeating approval/payment',async()=>{
 const fetcher=vi.fn().mockImplementation(async(_url:string,init?:RequestInit)=>init?.method==='POST'?Response.json({delivery:'Mailpit accepted'}):Response.json({...workflow,approval:{approved_by:'staff@example.test',approved_at:'2026-10-19T12:00:00Z',acknowledgement_version:'v1',acknowledgement_text:'Reviewed',activated_at:'2026-10-19T12:01:00Z',activated_by:'staff@example.test',subscription_start_month:'2026-11'},delivery:{mode:'mailpit',available:true,status:'Unconfirmed - not retried',provider_message_id:null,expires_at:null}}));vi.stubGlobal('fetch',fetcher);
 render(<MembershipReview id={1} onChange={()=>{}}/>);
 const button=await screen.findByRole('button',{name:'Capture password setup email locally'});
 expect(screen.getByText(/Mailpit local testing:/)).toHaveTextContent('No external email delivery.');expect(button).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);
 await waitFor(()=>expect(fetcher.mock.calls.some(call=>call[0]==='/api/membership/applications/1/invitation')).toBe(true));
 const mutation=fetcher.mock.calls.find(call=>call[1]?.method==='POST')!;
 expect(Object.keys(JSON.parse(mutation[1].body))).toEqual(['request_key']);
});
it('acknowledgement alone never posts payment and approval submits only the explicit acknowledgement',async()=>{
 const fetcher=vi.fn().mockImplementation(async(_url:string,init?:RequestInit)=>init?.method==='POST'?Response.json({completed:true}):Response.json({...workflow,can_approve:true,approval_blockers:[]}));vi.stubGlobal('fetch',fetcher);
 render(<MembershipReview id={1} onChange={()=>{}}/>);
 const approve=await screen.findByRole('button',{name:'Approve membership'});expect(approve).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox'));expect(fetcher).toHaveBeenCalledTimes(1);
 fireEvent.click(approve);await waitFor(()=>expect(fetcher).toHaveBeenCalledWith('/api/membership/applications/1/approve',expect.objectContaining({body:JSON.stringify({acknowledged:true,acknowledgement_version:'v1'})})));
});
it('shows actual paid fee and empty subscription state without a savings balance',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({registration_fees:[{amount:'20.00',currency:'USD',reference:'SYNTHETIC-RECEIPT',payment_date:'2026-01-01',status:'Paid'}],subscriptions:[]})));
 render(<MemberFees/>);await screen.findByText('Registration fee — US$20 — Paid');
 expect(screen.getByText('Reference: SYNTHETIC-RECEIPT')).toBeInTheDocument();expect(screen.getByText('No subscriptions recorded.')).toBeInTheDocument();expect(document.body.textContent).not.toMatch(/Savings balance/);
});
it('removes setup fragment and preserves password on failure for safe retry',async()=>{
 window.history.replaceState(null,'','/setup-password#token='+'x'.repeat(43));
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({error:'Try again.'},{status:503})).mockResolvedValueOnce(new Response(null,{status:204}));vi.stubGlobal('fetch',fetcher);
 render(<PasswordSetup/>);await screen.findByLabelText('New password');expect(window.location.hash).toBe('');
 fireEvent.change(screen.getByLabelText('New password'),{target:{value:'Synthetic-only-123!'}});fireEvent.change(screen.getByLabelText('Confirm password'),{target:{value:'Synthetic-only-123!'}});
 fireEvent.click(screen.getByRole('button',{name:'Set password'}));await screen.findByText('Try again.');expect(screen.getByLabelText('New password')).toHaveValue('Synthetic-only-123!');expect(screen.queryByText('Password set')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Set password'}));await screen.findByText('Password set');
 window.history.replaceState(null,'','/setup-password#token='+'y'.repeat(43));
 fireEvent(window,new HashChangeEvent('hashchange'));
 await screen.findByLabelText('New password');expect(window.location.hash).toBe('');
 expect(screen.queryByText('Password set')).not.toBeInTheDocument();
});
