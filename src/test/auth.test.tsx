import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/components/auth/AuthProvider';
import { AuthenticatedWorkspace } from '@/components/portal/AuthenticatedWorkspace';
import type { Identity } from '@/lib/auth-types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Navigate: () => <p>Login required</p>,
}));
const member: Identity = { user: { id: 1, email: 'synthetic@example.test', is_active: true, role_id: 1 }, workspace: 'member', permissions: ['members:own'] };
afterEach(() => vi.unstubAllGlobals());
function Controls() {
  const auth = useAuth();
  return <><p>{auth.identity?.workspace ?? auth.status}</p><p>{auth.notice}</p><button onClick={() => void auth.logout()}>Sign out</button><button onClick={() => void auth.refresh()}>Refresh</button></>;
}
describe('Authenticated frontend', () => {
  it('describes member contributions without staff instructions', async () => {
    vi.stubGlobal('fetch',vi.fn().mockImplementation(async (path:string)=>Response.json(path==='/api/auth/me'?{...member,permissions:['members:own','savings:own']}:{items:[],total:0,summary:{available:true,confirmed:[],pending:[],legacy_requires_review:0,message:'Fees excluded'}})));
    render(<AuthProvider><AuthenticatedWorkspace role="member" screen="contributions" /></AuthProvider>);
    await screen.findByText('View your contribution history, confirmed savings and receipts. Pending contributions are shown separately.');
    expect(screen.queryByText(/Record, verify and reconcile office contributions/)).not.toBeInTheDocument();
    expect(screen.getByText(/Your contributions remain pending/)).toBeInTheDocument();
  });
  it('never opens anonymous workspaces or renders fixture balances', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(<AuthProvider><AuthenticatedWorkspace role="member" screen="dashboard" /></AuthProvider>);
    await screen.findByText('Login required');
    expect(screen.queryByText('Tariro Moyo')).not.toBeInTheDocument();
    expect(screen.queryByText(/confirmed savings/i)).not.toBeInTheDocument();
  });
  it('rejects a cross-role workspace and does not render its shell', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(member)));
    render(<AuthProvider><AuthenticatedWorkspace role="admin" screen="staff" /></AuthProvider>);
    await screen.findByText('Access denied');
    expect(screen.queryByRole('navigation', { name: 'Admin portal navigation' })).not.toBeInTheDocument();
  });
  it('uses the original shell with an unavailable state and a real logout action', async () => {
    const fetcher = vi.fn().mockImplementation(async (path: string) => path.endsWith('logout') ? new Response(null, { status: 204 }) : Response.json(member));
    vi.stubGlobal('fetch', fetcher);
    render(<AuthProvider><AuthenticatedWorkspace role="member" screen="profile" /></AuthProvider>);
    await screen.findByText('This screen is not available yet');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('Login required');
    expect(fetcher.mock.calls.some(call => call[0] === '/api/auth/logout')).toBe(true);
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('handles backend session revocation with a clear expiry message', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(member)).mockImplementation(async () => new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    render(<AuthProvider><Controls /></AuthProvider>);
    await screen.findByText('member');
    fireEvent.click(screen.getByText('Refresh'));
    await screen.findByText('Your session has expired. Please log in again.');
    await waitFor(() => expect(screen.queryByText('member')).not.toBeInTheDocument());
  });
  it('hides the workspace when the session cannot be verified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<AuthProvider><AuthenticatedWorkspace role="admin" screen="dashboard" /></AuthProvider>);
    await screen.findByRole('alert');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
