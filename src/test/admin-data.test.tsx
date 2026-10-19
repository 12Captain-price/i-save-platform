import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OrganisationOverview, MembersDirectory } from '@/components/portal/AdminDataScreens';
const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/components/auth/AuthProvider', () => ({ useAuth: () => ({ refresh }) }));
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
afterEach(() => { vi.unstubAllGlobals(); refresh.mockClear(); });
it('shows real zero counts and a clear empty organisation', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ member_count:0, linked_member_count:0, unlinked_member_count:0, account_count:1 })));
 render(<OrganisationOverview />);
 await screen.findByText('No member records yet');
 expect(screen.getByTestId('count-Member records')).toHaveTextContent('0');
 expect(screen.getByTestId('count-Login accounts')).toHaveTextContent('1');
});
it.each([403,503])('does not disguise HTTP %s as zero counts', async status => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
 render(<OrganisationOverview />);
 await screen.findByRole('alert');
 expect(screen.queryByTestId('count-Member records')).not.toBeInTheDocument();
 expect(screen.queryByText('No member records yet')).not.toBeInTheDocument();
});
it('uses backend totals, offsets and search and resets the page on search', async () => {
 const member = { id:1, member_number:'REAL-1', first_name:'Isolated', last_name:'Record', email:null, phone:null, user_id:null, joined_at:null };
 const fetcher = vi.fn().mockImplementation(async (url: string) => {
  const q = new URL(url, 'http://localhost').searchParams.get('q');
  return Response.json({ items:q ? [] : [member], total:q ? 0 : 12, skip:0, limit:10 });
 });
 vi.stubGlobal('fetch', fetcher); render(<MembersDirectory />);
 await screen.findByText('12');
 fireEvent.click(screen.getByRole('button', { name:'Next' }));
 await waitFor(() => expect(fetcher.mock.lastCall?.[0]).toContain('skip=10'));
 await screen.findByText('Page 2 of 2');
 fireEvent.change(screen.getByLabelText('Find a member'), { target:{ value:'Nobody & else' } });
 fireEvent.click(screen.getByRole('button', { name:/^Search$/ }));
 await screen.findByText('No members match your search');
 expect(fetcher.mock.lastCall?.[0]).toContain('skip=0');
 expect(fetcher.mock.lastCall?.[0]).toContain('q=Nobody+%26+else');
 expect(screen.getByRole('button', { name:'Next' })).toBeDisabled();
});
it('refreshes authentication after an expired member request', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status:401 })));
 render(<MembersDirectory />);
 await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
 await screen.findByText('Your session has expired. Please log in again.');
});

