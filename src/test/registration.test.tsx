import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Registration } from '@/components/auth/Registration';
import { ApplicationScreens } from '@/components/portal/ApplicationScreens';
const refresh = vi.hoisted(()=>vi.fn());
vi.mock('@/components/auth/AuthProvider',()=>({useAuth:()=>({refresh})}));
vi.mock('@/components/site/PublicLayout',()=>({PublicLayout:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('@/lib/live-public-contact',async()=>{const {publicContact}=await import('@/lib/public-contact');return {usePublicContacts:()=>({contact:publicContact,error:false,retry:vi.fn()})};});
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:React.ReactNode})=><span>{children}</span>}));
afterEach(()=>{vi.unstubAllGlobals();refresh.mockClear();});
it('submits application details once and clearly describes pending-only acknowledgement',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:202}));vi.stubGlobal('fetch',fetcher);
 render(<Registration/>);
 fireEvent.change(screen.getByLabelText('First name (required)'),{target:{value:'Synthetic'}});
 fireEvent.change(screen.getByLabelText('Last name (required)'),{target:{value:'Applicant'}});
 fireEvent.change(screen.getByLabelText('Email address (required)'),{target:{value:'test@example.test'}});
 fireEvent.click(screen.getByRole('button',{name:'Submit application'}));
 await screen.findByText('Application received');
 const submissions=fetcher.mock.calls.filter(([,init])=>init?.method==='POST'); expect(submissions).toHaveLength(1);
 const body=JSON.parse(fetcher.mock.calls.find(([,init])=>init?.method==='POST')![1].body);
 expect(body.email).toBe('test@example.test');expect(body).not.toHaveProperty('password');expect(body).not.toHaveProperty('status');
 expect(screen.queryByRole('button',{name:'Submit application'})).not.toBeInTheDocument();
});
it.each([400,429,503])('shows registration failure for %s without a false acknowledgement',async status=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:'Please try again.'},{status})));
 render(<Registration/>);fireEvent.submit(screen.getByRole('button',{name:'Submit application'}).closest('form')!);
 await screen.findByRole('alert');expect(screen.queryByText('Application received')).not.toBeInTheDocument();
});
it('shows empty and denied application lists without sample applicants',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({items:[],total:0,skip:0,limit:10})));
 render(<ApplicationScreens/>);await screen.findByText('No applications yet');
 fireEvent.change(screen.getByLabelText('Find an application'),{target:{value:'Nobody'}});
 fireEvent.click(screen.getByRole('button',{name:'Search'}));await screen.findByText('No applications match your search');
});
it('renders populated detail and actual recorded history without approval actions',async()=>{
 const record={id:7,application_number:'SYNTHETIC-7',first_name:'Test',last_name:'Applicant',email:'test@example.test',status:'Pending',submitted_at:'2026-10-19T12:00:00Z',history:[{id:1,status:'Pending',note:'Public application submitted.',actor_user_id:null,recorded_at:'2026-10-19T12:00:00Z'}]};
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url:string)=>Response.json(url.startsWith('/api/membership/')?{fee_policy:{amount:'20.00',currency:'USD',settings_version:0},payment:null,approval:null,approval_blockers:['Registration fee must be verified as US$20.'],can_approve:false,can_verify:false,acknowledgement:{acknowledgement:'Review requires verified fee',acknowledgement_version:'test'},delivery:{available:false,status:'Not issued'}}:url.endsWith('/7')?record:{items:[record],total:1})));
 render(<ApplicationScreens/>);fireEvent.click(await screen.findByRole('button',{name:'View application for Test Applicant'}));
 await screen.findByText('Status history');await screen.findByText('Public application submitted.');
 expect(await screen.findByRole('button',{name:'Approve membership'})).toBeDisabled();
 expect(screen.queryByRole('button',{name:'Record US$20 payment'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Back to applications'}));await screen.findByText('1 application recorded');
});
it('renders permission denial, not an empty application list',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:403})));
 render(<ApplicationScreens/>);await screen.findByText('Access denied');expect(screen.queryByText('No applications yet')).not.toBeInTheDocument();
});


it('shows required preparation and only approved help contacts before the form',()=>{
 render(<Registration/>);
 expect(screen.getByText(/Have your first name, last name and email address ready/)).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Need help registering?'})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'+263 29 226 1341'})).toHaveAttribute('href','tel:+263292261341');
 expect(screen.getByRole('link',{name:'+263 78 552 1029'})).toHaveAttribute('href','tel:+263785521029');
 expect(screen.getByRole('link',{name:'+263 78 663 9536'})).toHaveAttribute('href','tel:+263786639536');
 expect(screen.getByRole('link',{name:'zpyfinfo@gmail.com'})).toHaveAttribute('href','mailto:zpyfinfo@gmail.com');
 expect(screen.getByText('5th floor, Office 511, Yolk House, Bulawayo, Zimbabwe')).toBeInTheDocument();
 expect(document.body.textContent).not.toMatch(/WhatsApp|info@isave|123 4567|Harare/);
});
it('preserves all entered details on failure and focuses a safe retry, then confirms without disclosing a reference',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(Response.json({id:999,application_number:'PRIVATE'},{status:202}));
 vi.stubGlobal('fetch',fetcher);render(<Registration/>);
 fireEvent.change(screen.getByLabelText('First name (required)'),{target:{value:'Synthetic'}});
 fireEvent.change(screen.getByLabelText('Last name (required)'),{target:{value:'Applicant'}});
 fireEvent.change(screen.getByLabelText('Email address (required)'),{target:{value:'retry@example.test'}});
 fireEvent.change(screen.getByLabelText('Reason for applying (optional)'),{target:{value:'Keep these details'}});
 fireEvent.click(screen.getByRole('button',{name:'Submit application'}));
 const alert=await screen.findByRole('alert');await waitFor(()=>expect(alert).toHaveFocus());
 expect(screen.getByLabelText('Email address (required)')).toHaveValue('retry@example.test');
 expect(screen.getByLabelText('Reason for applying (optional)')).toHaveValue('Keep these details');
 expect(screen.queryByRole('heading',{name:'Application received'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Retry submission'}));
 const confirmation=await screen.findByRole('status');await waitFor(()=>expect(confirmation).toHaveFocus());
 const attempts=fetcher.mock.calls.filter(([,init])=>init?.method==='POST'); expect(attempts[0]![1].body).toBe(attempts[1]![1].body);
 expect(screen.getByText('Your application is awaiting review. This does not mean your membership has been approved.')).toBeInTheDocument();
 expect(screen.getByRole('list')).toBeInTheDocument();
 expect(screen.getByText('Submitting an application does not create a login account or confirm a payment.')).toBeInTheDocument();
 expect(screen.getByRole('complementary',{name:'Application follow-up'})).toBeInTheDocument();
 expect(document.body.textContent).not.toMatch(/PRIVATE|999|email (was|has been) sent/i);
 expect(screen.queryByLabelText('Email address (required)')).not.toBeInTheDocument();
});

it('offers five optional cards with pending information and no terms acceptance',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:202}));vi.stubGlobal('fetch',fetcher);
 render(<Registration/>);
 expect(screen.getAllByRole('radio')).toHaveLength(5);
 expect(screen.queryByRole('combobox')).not.toBeInTheDocument();expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('radio',{name:'Education'}));
 expect(screen.getByRole('radio',{name:'Education'})).toBeChecked();
 expect(screen.getByRole('region',{name:'Selected category information'})).toHaveTextContent('Expression of interest\u2014plan terms awaiting confirmation.');
 fireEvent.change(screen.getByLabelText('First name (required)'),{target:{value:'Synthetic'}});
 fireEvent.change(screen.getByLabelText('Last name (required)'),{target:{value:'Applicant'}});
 fireEvent.change(screen.getByLabelText('Email address (required)'),{target:{value:'interest@example.test'}});
 fireEvent.click(screen.getByRole('button',{name:'Submit application'}));
 await screen.findByText('Application received');
 const body=JSON.parse(fetcher.mock.calls.find(([,init])=>init?.method==='POST')![1].body);
 expect(body.preferred_category).toBe('education');expect(body.interest_notice_version).toBe('savings-interest-v1');
 expect(body).not.toHaveProperty('accepted_terms');
 expect(screen.getByRole('region',{name:'Submitted category preference'})).toHaveTextContent('No plan terms were accepted.');
});
