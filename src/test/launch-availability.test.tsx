import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {LaunchAvailability} from '@/components/auth/LaunchAvailability';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('allows document review in applications mode without opening the financial guard',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({mode:'applications'})));
 render(<><LaunchAvailability kind="documents"><button>Review evidence</button></LaunchAvailability><LaunchAvailability kind="financial"><button>Approve membership</button></LaunchAvailability></>);
 expect(await screen.findByText('Review evidence')).toBeInTheDocument();expect(screen.queryByText('Approve membership')).toBeNull();
});
it('does not show a registration form in informational mode',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({mode:'informational'})));
 render(<LaunchAvailability kind="registration"><button>Submit application</button></LaunchAvailability>);
 expect(await screen.findByText('This service is currently unavailable')).toBeInTheDocument();expect(screen.queryByText('Submit application')).toBeNull();
});
it('allows applications while withholding financial actions',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({mode:'applications'})));
 render(<LaunchAvailability kind="financial"><button>Approve payment</button></LaunchAvailability>);
 expect(await screen.findByText('This service is currently unavailable')).toBeInTheDocument();expect(screen.queryByText('Approve payment')).toBeNull();
});
it('retains explicit administrative access without implying financial access',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({mode:'informational'})));
 render(<LaunchAvailability kind="workspace" admin><h1>Settings</h1></LaunchAvailability>);
 expect(await screen.findByText('Settings')).toBeInTheDocument();
});
it('fails closed with a safe retry when availability cannot be checked',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error()));render(<LaunchAvailability kind="registration"><button>Submit application</button></LaunchAvailability>);
 expect(await screen.findByText('Availability could not be checked')).toBeInTheDocument();expect(screen.getByText('Retry availability check')).toBeInTheDocument();
});
