import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OrganisationSettings } from '@/components/portal/OrganisationSettings';
import { RegistrationHelp } from '@/components/site/RegistrationHelp';
vi.mock('@/components/portal/FeeRateSettings',()=>({FeeRateSettings:()=>null}));
const auth=vi.hoisted(()=>({identity:{permissions:['settings:read','settings:write','settings:publish']},refresh:vi.fn()}));
vi.mock('@/components/auth/AuthProvider',()=>({useAuth:()=>auth}));
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:React.ReactNode})=><span>{children}</span>}));
const terms={office:'Synthetic office',email:'office@example.test',office_phone:'+263 29 226 1341',director_phone:'+263 78 552 1029',additional_phone:'+263 78 663 9536',registration_amount:'20.00',registration_currency:'USD',subscription_amount:'5.00',subscription_currency:'USD',subscription_start:'next_calendar_month',subscription_due_day:null,review_acknowledgement:'Synthetic reviewer wording'};
const state={head_version:2,active_version:1,active_terms:terms,versions:[{version:2,terms,missing_decisions:[],actor_email:'admin@example.test',recorded_at:'2026-10-20T10:00:00Z'}],publications:[],impacts:{subscriptions:'Future activations only.'},unsupported:['Refunds','Withdrawals'],preview:{version:2,blockers:[],changes:{office:{from:'Old office',to:'Synthetic office'}}}};
afterEach(()=>{vi.unstubAllGlobals();auth.identity.permissions=['settings:read','settings:write','settings:publish'];});

it('denies settings without making a settings request',()=>{
  auth.identity.permissions=[];const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<OrganisationSettings/>);
  expect(screen.getByRole('alert')).toHaveTextContent('Access denied');expect(fetcher).not.toHaveBeenCalled();
});
it('displays publication effects and prevents publishing unsaved edits',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(state)));render(<OrganisationSettings/>);
  await screen.findByRole('heading',{name:'Edit a draft'});
  expect(screen.getByRole('region',{name:'Publication preview'})).toHaveTextContent('Future activations only.');
  expect(screen.getByRole('button',{name:'Publish saved settings version'})).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Office address'),{target:{value:'Unsaved office'}});
  expect(screen.getByRole('button',{name:'Publish saved settings version'})).toBeDisabled();
  expect(screen.getByLabelText('Subscription due day (optional)')).toHaveValue(null);
});
it('preserves values and retries the exact settings save after response loss',async()=>{
  const bodies:string[]=[];
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async(_url:string,init?:RequestInit)=>{
    if(init?.method==='POST'){bodies.push(String(init.body));throw new TypeError('Failed to fetch');}
    return Response.json(state);
  }));render(<OrganisationSettings/>);await screen.findByRole('heading',{name:'Edit a draft'});
  fireEvent.change(screen.getByLabelText('Office address'),{target:{value:'Retained draft office'}});
  fireEvent.click(screen.getByRole('button',{name:'Save settings draft'}));await screen.findByRole('alert');
  expect(screen.getByLabelText('Office address')).toHaveValue('Retained draft office');
  expect(screen.getByLabelText('Office address')).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Retry same save'}));
  await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[1]).toBe(bodies[0]);
  expect(JSON.parse(bodies[0]!).terms.subscription_due_day).toBeNull();
});
it('uses published contacts and does not fall back to stale contacts after an error',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValue(Response.json(terms));
  vi.stubGlobal('fetch',fetcher);render(<RegistrationHelp/>);
  await screen.findByText('Office contact details are temporarily unavailable.');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Retry contacts'}));
  const email=await screen.findByRole('link',{name:'office@example.test'});expect(email).toHaveAttribute('href','mailto:office@example.test');
  expect(screen.getByRole('link',{name:'+263 29 226 1341'})).toHaveAttribute('href','tel:+263292261341');
  expect(screen.getByText('Synthetic office')).toBeInTheDocument();
});
it('uses readable withdrawal decisions in effective values, publication preview and history',async()=>{
 const saved={...terms,withdrawal_mode:'full_or_partial',withdrawal_separation:'processor_verifier_separate'};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...state,active_terms:saved,versions:[{...state.versions[0],terms:saved}],preview:{...state.preview,changes:{withdrawal_mode:{from:'full_only',to:'full_or_partial'}}}})));
 render(<OrganisationSettings/>);await screen.findByRole('heading',{name:'Edit a draft'});
 const effective=screen.getByText('View currently effective values').closest('details')!;
 expect(within(effective).getByText('Full or partial amounts')).toBeInTheDocument();expect(within(effective).getByText('Processor and verifier distinct')).toBeInTheDocument();
 expect(screen.getByRole('region',{name:'Publication preview'})).toHaveTextContent('Full balance only');expect(screen.getByRole('region',{name:'Publication preview'})).toHaveTextContent('Full or partial amounts');
 const history=document.getElementById('settings-history')!;expect(within(history).getByText('Processor and verifier distinct')).toBeInTheDocument();expect(history.textContent).not.toContain('processor_verifier_separate');
});
