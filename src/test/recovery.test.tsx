import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {Recovery} from '@/components/auth/Recovery';
vi.mock('@/components/site/PublicLayout',()=>({PublicLayout:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock('@/components/site/RegistrationHelp',()=>({RegistrationHelp:()=>null}));
vi.mock('@/components/auth/PasswordSetup',()=>({PasswordSetup:({recovery}:{recovery:boolean})=><h1>{recovery?'Private reset form':'Setup form'}</h1>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();window.history.replaceState(null,'','/recovery');});
it('opens a newly followed fragment link while already on recovery',async()=>{window.history.replaceState(null,'','/recovery');render(<Recovery/>);expect(screen.getByRole('heading',{name:'Recover your account'})).toBeVisible();window.history.replaceState(null,'','/recovery#token=synthetic-invalid-fixture');fireEvent(window,new Event('hashchange'));expect(await screen.findByRole('heading',{name:'Private reset form'})).toBeVisible();});
it('shows generic acknowledgement without claiming delivery',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({message:'If recovery is available, a link will be prepared. No delivery is guaranteed.'},{status:202})));render(<Recovery/>);fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'unknown@example.test'}});fireEvent.click(screen.getByRole('button',{name:'Request recovery link'}));expect(await screen.findByRole('status')).toHaveTextContent('No delivery is guaranteed');});
