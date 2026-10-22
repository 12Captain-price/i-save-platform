vi.mock('@/components/auth/RegistrationEvidence',async(importOriginal)=>({...await importOriginal<object>(),RegistrationEvidence:()=>null}));
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {AssistedRegistration} from '@/components/auth/AssistedRegistration';
import {ApplicationScreens} from '@/components/portal/ApplicationScreens';
import authorization from '../../backend/app/assisted_authorization.json';
const state=vi.hoisted(()=>({identity:{workspace:'staff',permissions:['applications:assist','applications:read'],user:{id:7,email:'synthetic-staff@example.test'}},refresh:vi.fn()}));
vi.mock('@/components/auth/AuthProvider',()=>({useAuth:()=>state}));
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:React.ReactNode})=><span>{children}</span>}));
afterEach(()=>{vi.unstubAllGlobals();state.identity.workspace='staff';state.identity.permissions=['applications:assist','applications:read'];state.refresh.mockClear();});
it.each(['member','finance','staff'])('denies %s without authorised assisted access',role=>{
 state.identity.workspace=role;state.identity.permissions=role==='staff'?['applications:read']:['applications:assist'];
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<AssistedRegistration/>);
 expect(screen.getByText('Access denied')).toBeInTheDocument();expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();expect(fetcher).not.toHaveBeenCalled();
});
it('requires unticked applicant authorisation, preserves consent/details on retry and sends no actor',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(new Response(null,{status:202}));vi.stubGlobal('fetch',fetcher);
 render(<AssistedRegistration/>);
 const consent=screen.getByRole('checkbox',{name:authorization.wording});expect(consent).not.toBeChecked();expect(consent).toBeRequired();
 fireEvent.change(screen.getByLabelText('First name (required)'),{target:{value:'Assisted'}});
 fireEvent.change(screen.getByLabelText('Last name (required)'),{target:{value:'Synthetic'}});
 fireEvent.change(screen.getByLabelText('Email address (required)'),{target:{value:'assist@example.test'}});
 fireEvent.click(screen.getByRole('button',{name:'Submit application'}));expect(fetcher).not.toHaveBeenCalled();
 fireEvent.click(consent);fireEvent.click(screen.getByRole('radio',{name:'Education'}));fireEvent.click(screen.getByRole('button',{name:'Submit application'}));
 await screen.findByRole('alert');expect(consent).toBeChecked();expect(screen.getByLabelText('Email address (required)')).toHaveValue('assist@example.test');
 fireEvent.click(screen.getByRole('button',{name:'Retry submission'}));await screen.findByText('Application received');
 expect(fetcher.mock.calls[0]![0]).toBe('/api/registration/assisted');
 const payload=JSON.parse(fetcher.mock.calls[0]![1].body);
 expect(payload.applicant_authorized).toBe(true);expect(payload.authorization_version).toBe(authorization.version);expect(payload.preferred_category).toBe('education');
 expect(payload).not.toHaveProperty('actor_user_id');expect(payload).not.toHaveProperty('actor_email');
 expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[1]![1].body);
 expect(screen.getByText(/You submitted an assisted request/)).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'zpyfinfo@gmail.com'})).toHaveAttribute('href','mailto:zpyfinfo@gmail.com');
});
it.each([401,403])('refreshes access after assisted HTTP %s without success',async status=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status})));
 render(<AssistedRegistration/>);
 fireEvent.submit(screen.getByRole('button',{name:'Submit application'}).closest('form')!);
 await waitFor(()=>expect(state.refresh).toHaveBeenCalledOnce());await screen.findByRole('alert');expect(screen.queryByText('Application received')).not.toBeInTheDocument();
});
it('shows the action only with the specific permission and displays protected source/consent/history',async()=>{
 const record={id:7,first_name:'Assisted',last_name:'Synthetic',email:'assist@example.test',status:'Pending',submitted_at:'2026-10-19T12:00:00Z',application_number:'TEST',submission:{source:'staff_assisted',actor_user_id:7,actor_email:'synthetic-staff@example.test',applicant_authorized:true,authorization_version:authorization.version,authorization_text:authorization.wording,authorized_at:'2026-10-19T12:00:00Z'},history:[{id:1,status:'Pending',actor_user_id:7,actor_email:'synthetic-staff@example.test',note:'Staff-assisted application submitted.',recorded_at:'2026-10-19T12:00:00Z'}]};
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url:string)=>Response.json(url.endsWith('/7')?record:{items:[record],total:1})));
 render(<ApplicationScreens/>);expect(screen.getByText('Assist an applicant')).toBeInTheDocument();
 fireEvent.click(await screen.findByRole('button',{name:'View application for Assisted Synthetic'}));
 await screen.findByText('Staff-assisted');expect(screen.getByText(authorization.wording)).toBeInTheDocument();
 expect(screen.getByText('Actor identity: synthetic-staff@example.test')).toBeInTheDocument();
});
vi.mock('@/lib/live-public-contact',async()=>{const {publicContact}=await import('@/lib/public-contact');return {usePublicContacts:()=>({contact:publicContact,error:false,retry:vi.fn()})};});
