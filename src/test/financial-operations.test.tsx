import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {FinancialReports,SubscriptionGeneration} from '@/components/portal/FinancialOperations';
import {SubscriptionPayments} from '@/components/portal/SubscriptionPayments';
import {handleAuthentication} from '@/lib/auth-server';
const auth=vi.hoisted(()=>({identity:{permissions:['reports:read','subscriptions:generate']},refresh:vi.fn()}));
vi.mock('@/components/auth/AuthProvider',()=>({useAuth:()=>auth}));
afterEach(()=>{vi.unstubAllGlobals();auth.identity.permissions=['reports:read','subscriptions:generate'];});
it('denies reports and hides generation without fetching',()=>{
 auth.identity.permissions=[];const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<><FinancialReports/><SubscriptionGeneration/></>);
 expect(screen.getByRole('alert')).toHaveTextContent('permission');expect(fetcher).not.toHaveBeenCalled();
});
it('previews without posting and enables explicit generation only after preview',async()=>{
 const onCreated=vi.fn();const f=vi.fn().mockImplementation(async()=>Response.json({count:1,created:0,items:[],explanation:'Preview only',requires_review_member_ids:[]}));vi.stubGlobal('fetch',f);render(<SubscriptionGeneration onCreated={onCreated}/>);
 expect(screen.getByRole('button',{name:'Run monthly generation'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Preview missing obligations'}));
 await screen.findByText('1 missing obligations');expect(f.mock.calls[0]![1]!.method).toBe('GET');
 fireEvent.click(screen.getByRole('button',{name:'Run monthly generation'}));await waitFor(()=>expect(f).toHaveBeenCalledTimes(2));
 expect(f.mock.calls[1]![1]!.method).toBe('POST');expect(JSON.parse(f.mock.calls[1]![1]!.body)).toEqual({through:null});await waitFor(()=>expect(onCreated).toHaveBeenCalledTimes(1));
});
it('reports empty data and offers safe retry without a false success',async()=>{
 const f=vi.fn().mockRejectedValueOnce(Error('Service unavailable')).mockResolvedValueOnce(Response.json({items:[],total:0,totals:[],net_ledger_movement:[],definition:'Synthetic report definition'}));vi.stubGlobal('fetch',f);render(<FinancialReports/>);
 fireEvent.change(screen.getByLabelText('From (inclusive)'),{target:{value:'2026-10-01'}});fireEvent.change(screen.getByLabelText('To (inclusive)'),{target:{value:'2026-10-31'}});
 fireEvent.click(screen.getByRole('button',{name:'Load report'}));await screen.findByRole('alert');expect(screen.queryByText(/No source records/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Load report'}));await screen.findByText('No source records match these filters.');expect(screen.getByText('No savings-ledger movement in this period')).toBeInTheDocument();expect(screen.getByLabelText('From (inclusive)')).toHaveValue('2026-10-01');
 expect(screen.queryByRole('button',{name:'Export filtered CSV'})).not.toBeInTheDocument();
});
it('financial bridge rejects anonymous and cross-origin generation without forwarding',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 const r=await handleAuthentication(new Request('http://localhost:3000/api/financial/reports?start=2026-10-01&end=2026-10-31'));
 expect(r?.status).toBe(401);expect(f).not.toHaveBeenCalled();
 const attack=await handleAuthentication(new Request('http://localhost:3000/api/financial/subscriptions/run',{method:'POST',headers:{Cookie:'isave_session='+'x'.repeat(43),Origin:'http://attacker.test','X-Isave-Request':'1','Content-Type':'application/json'},body:'{}'}));
 expect([401,403]).toContain(attack?.status);expect(f).not.toHaveBeenCalled();
});
it('separates unpaid obligation source rows from the empty savings ledger',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({items:[{category:'subscription_obligations',source_id:'1',date:'2026-10-01',amount:'5.00',currency:'USD',status:'Pending',reference:'TEST-OBLIGATION',linked_id:null}],total:1,totals:[{category:'subscription_obligations',currency:'USD',status:'Pending',amount:'5.00'}],net_ledger_movement:[],definition:'Synthetic obligation source, not a receipt'})));
 render(<FinancialReports/>);
 fireEvent.change(screen.getByLabelText('From (inclusive)'),{target:{value:'2026-10-01'}});fireEvent.change(screen.getByLabelText('To (inclusive)'),{target:{value:'2026-10-31'}});
 fireEvent.click(screen.getByRole('button',{name:'Load report'}));
 await screen.findByText('No savings-ledger movement in this period');
 const sources=screen.getByRole('list',{name:'Source records'});
 expect(sources).toHaveTextContent('TEST-OBLIGATION');
 expect(screen.getByRole('heading',{name:'Source records',level:3})).toBeInTheDocument();
 expect(screen.getByText('Obligation rows show amounts due; they are not savings-ledger movements or payment receipts.')).toBeInTheDocument();
});
it('refreshes the subscription queue automatically after generation succeeds',async()=>{
 auth.identity.permissions=['subscriptions:read','subscriptions:generate'];
 const row={id:1,member_number:'TEST-MEMBER',member_name:'Synthetic Member',period_month:'2026-09',amount:'5.00',currency:'USD',status:'Pending',payment_status:'Unpaid',obligation:null,payment:null};
 let generated=false;
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(path:string)=>{
  if(path.includes('/subscriptions/run')){generated=true;return Response.json({count:1,created:1,items:[],explanation:'Run completed',requires_review_member_ids:[]});}
  if(path.includes('/subscriptions/preview'))return Response.json({count:1,created:0,items:[],explanation:'Preview only',requires_review_member_ids:[]});
  return Response.json({total:generated?2:1,items:generated?[{...row,id:2,period_month:'2026-10'},row]:[row]});
 }));
 render(<SubscriptionPayments/>);
 await screen.findByText(/Synthetic Member.*2026-09/);
 expect(screen.queryByText(/Synthetic Member.*2026-10/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Preview missing obligations'}));await screen.findByText('1 missing obligations');
 fireEvent.click(screen.getByRole('button',{name:'Run monthly generation'}));
 await screen.findByText(/Synthetic Member.*2026-10/);
 expect(screen.getAllByRole('article')).toHaveLength(2);
});
