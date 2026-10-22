import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlanDrafts } from '@/components/portal/PlanDrafts';
const auth = vi.hoisted(() => ({ identity: { permissions: ['plans:drafts:read', 'plans:drafts:write'] }, refresh: vi.fn() }));
vi.mock('@/components/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
afterEach(() => { vi.unstubAllGlobals(); auth.identity.permissions = ['plans:drafts:read', 'plans:drafts:write']; });

it('denies draft access without a read permission and makes no request', () => {
  auth.identity.permissions = [];
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  render(<PlanDrafts />);
  expect(screen.getByRole('alert')).toHaveTextContent('Access denied'); expect(fetcher).not.toHaveBeenCalled();
});

it('does not show save controls for a read-only administrator', async () => {
  auth.identity.permissions = ['plans:drafts:read'];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [], total: 0 })));
  render(<PlanDrafts />); await screen.findByText(/No drafts on this page/);
  expect(screen.queryByRole('button', { name:'Create draft' })).not.toBeInTheDocument();
});

it('saves incomplete drafts without defaults and retries the exact request after an uncertain failure', async () => {
  let attempts = 0;
  const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { attempts++; if (attempts === 1) throw new TypeError('Failed to fetch'); return Response.json({ draft_id:1 }); }
    return Response.json({ items:[], total:0 });
  });
  vi.stubGlobal('fetch', fetcher); render(<PlanDrafts />);
  await screen.findByText(/No drafts on this page/); fireEvent.click(screen.getByRole('button', { name:'Create draft' }));
  expect(screen.getByLabelText('Currency')).toHaveValue('');
  expect(screen.getByLabelText('Fixed contribution amount')).toHaveValue(null);
  fireEvent.change(screen.getByLabelText('Description'), { target:{ value:'Unapproved proposal' } });
  fireEvent.click(screen.getByRole('button', { name:'Save unpublished draft' }));
  await screen.findByRole('alert'); expect(screen.getByLabelText('Description')).toHaveValue('Unapproved proposal');
  expect(screen.getByLabelText('Description')).toBeDisabled();
  expect(screen.getByRole('textbox', {name:/^Description$/})).toHaveValue('Unapproved proposal');
  const first = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')![1].body;
  fireEvent.click(screen.getByRole('button', { name:'Retry same save' }));
  await screen.findByText('Draft saved. It remains unpublished and unavailable for enrolment.');
  const requests = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(requests[1]![1].body).toBe(first);
  const body = JSON.parse(first); expect(body.terms.currency).toBeNull(); expect(body.terms.fixed_amount).toBeNull();
  expect(body.terms.description).toBe('Unapproved proposal'); expect(body.base_version).toBe(0);
});

it('treats a backend denial as a denial instead of an empty result', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status:403 })));
  render(<PlanDrafts />); await screen.findByRole('heading', { name:'Access denied' });
  expect(screen.queryByText(/No drafts on this page/)).not.toBeInTheDocument();
});

it.each(['Unpublished draft', 'Approved - unpublished', 'Published / scheduled'])('uses the backend status on saved cards: %s', async (status) => {
  auth.identity.permissions = ['plans:drafts:read'];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({items:[{draft_id:9,version:2,status,terms:{category:'Education'},missing_decisions:[]}],total:1})));
  render(<PlanDrafts />);
  expect(await screen.findByText((text) => text.startsWith(status + ' \u00b7 version 2'))).toHaveTextContent('0 missing decisions');
});
