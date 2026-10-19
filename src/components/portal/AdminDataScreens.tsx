import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ArrowLeft, Users, Link2, UserRound, Search, RefreshCw, Unlink } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Overview = { member_count: number; linked_member_count: number; unlinked_member_count: number; account_count: number };
type Member = { id: number; member_number: string; first_name: string; last_name: string; email: string | null; phone: string | null; user_id: number | null; joined_at: string | null };
type MemberPage = { items: Member[]; total: number; skip: number; limit: number };
type Result<T> = { status: 'loading' | 'ready'; data: T | null; error: string; denied: boolean };
const count = (value: number) => value.toLocaleString('en');

function useRecords<T>(url: string) {
  const { refresh } = useAuth();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result<T>>({ status: 'loading', data: null, error: '', denied: false });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ status: 'loading', data: null, error: '', denied: false });
    void (async () => {
      try {
        const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (response.status === 401) {
          await refresh();
          if (!controller.signal.aborted) setResult({ status: 'ready', data: null, error: 'Your session has expired. Please log in again.', denied: false });
          return;
        }
        if (!response.ok) {
          if (!controller.signal.aborted) setResult({ status: 'ready', data: null, error: response.status === 403
            ? 'Your account does not have permission to view these records.' : 'We could not load these records. Please try again.', denied: response.status === 403 });
          return;
        }
        const data = await response.json() as T;
        if (!controller.signal.aborted) setResult({ status: 'ready', data, error: '', denied: false });
      } catch {
        if (!controller.signal.aborted) setResult({ status: 'ready', data: null, error: 'We could not load these records. Please try again.', denied: false });
      }
    })();
    return () => controller.abort();
  }, [url, revision, refresh]);
  return { ...result, reload: () => setRevision(v => v + 1) };
}

function Feedback({ error, denied, reload }: { error: string; denied: boolean; reload: () => void }) {
  return <section role="alert" className="rounded-xl border border-border bg-card p-6 sm:p-8"><h2 className="text-xl font-semibold">{denied ? 'Access denied' : 'Unable to load records'}</h2><p className="mt-2 text-sm text-muted-foreground">{error}</p>{!denied && <Button variant="outline" className="mt-5" onClick={reload}>Try again</Button>}</section>;
}

export function OrganisationOverview() {
  const result = useRecords<Overview>('/api/admin/overview');
  if (result.error) return <Feedback {...result} />;
  const cards = result.data ? [
    { label: 'Member records', value: result.data.member_count, detail: 'All recorded members', icon: Users },
    { label: 'With a linked account', value: result.data.linked_member_count, detail: 'Member records linked to a login', icon: Link2 },
    { label: 'Without an account link', value: result.data.unlinked_member_count, detail: 'Member records with no login link', icon: Unlink },
    { label: 'Login accounts', value: result.data.account_count, detail: 'All roles, including administrators', icon: UserRound },
  ] : null;
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><p className="max-w-xl text-sm leading-relaxed text-muted-foreground">A clear view of your organisation's member records and account links.</p><Button variant="outline" className="self-start sm:self-auto" aria-label="Refresh overview" disabled={result.status === 'loading'} onClick={result.reload}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
    <div aria-busy={result.status === 'loading'} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards ? cards.map(card => <article key={card.label} className="rounded-xl border border-border bg-card p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><h2 className="text-sm font-medium text-muted-foreground">{card.label}</h2><card.icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.5} /></div><p className="mt-5 font-display text-4xl font-semibold tabular-nums" data-testid={`count-${card.label}`}>{count(card.value)}</p><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{card.detail}</p></article>) : <p role="status" className="col-span-full rounded-xl border border-border bg-card p-8 text-muted-foreground">Loading organisation overview…</p>}
    </div>
    {result.data && <section className="flex flex-col justify-between gap-5 rounded-xl border border-primary/20 bg-primary/5 p-6 sm:flex-row sm:items-center sm:p-8"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">Member directory</p><h2 className="text-xl font-semibold">{result.data.member_count === 0 ? 'No member records yet' : 'Your members, in one place'}</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{result.data.member_count === 0 ? 'Member records will appear here once they have been recorded. Login accounts are counted separately.' : 'Find recorded members and check their contact details and account links.'}</p></div><Button asChild className="w-full shrink-0 sm:w-auto"><Link to="/portal/$role/$screen" params={{ role: 'admin', screen: 'members' }}>Open members<ArrowRight className="h-4 w-4" /></Link></Button></section>}
    <p className="text-xs leading-relaxed text-muted-foreground">An account link does not indicate membership approval or payment status. Financial totals are not shown here.</p>
  </div>;
}

function joined(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function AccountLink({ linked }: { linked: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${linked ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${linked ? 'bg-primary' : 'bg-muted-foreground'}`} />{linked ? 'Linked account' : 'No account link'}</span>;
}

export function MembersDirectory() {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(10);
  const result = useRecords<MemberPage>(`/api/admin/members?${new URLSearchParams({ q: search, skip: String(skip), limit: String(limit) })}`);
  const data = result.data;
  const loading = result.status === 'loading';
  return <div className="space-y-5">
    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Search recorded members and view their contact details. Account links are shown separately from membership or payment status.</p>
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4 sm:p-6"><form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); setSearch(draft.trim()); setSkip(0); }}>
        <div className="min-w-0 flex-1"><label htmlFor="member-search" className="mb-2 block text-sm font-medium">Find a member</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="member-search" type="search" maxLength={100} placeholder="Name, member number, email or phone" className="h-10 pl-9" value={draft} onChange={event => setDraft(event.target.value)} /></div></div>
        <div className="flex gap-2"><Button type="submit" className="flex-1 sm:flex-none" disabled={loading}>Search</Button>{(search || draft) && <Button type="button" variant="outline" onClick={() => { setDraft(''); setSearch(''); setSkip(0); }}>Clear</Button>}<Button type="button" variant="outline" size="icon" aria-label="Refresh members" disabled={loading} onClick={result.reload}><RefreshCw className="h-4 w-4" /></Button></div>
      </form></div>
      {result.error ? <div className="p-4 sm:p-6"><Feedback {...result} /></div> : loading ? <p role="status" className="p-10 text-center text-sm text-muted-foreground">Loading members…</p> : data && <>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6"><p role="status" aria-live="polite" className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground">{count(data.total)}</strong> {data.total === 1 ? 'member' : 'members'}{search ? ' found' : ' recorded'}</p><label className="flex items-center gap-2 text-xs text-muted-foreground">Rows per page<select aria-label="Rows per page" className="rounded-md border border-border bg-background px-2 py-1.5 text-foreground" value={limit} onChange={event => { setLimit(Number(event.target.value)); setSkip(0); }}>{[10,25,50].map(size => <option key={size} value={size}>{size}</option>)}</select></label></div>
        {data.items.length === 0 ? <div role="status" className="border-t border-border px-5 py-14 text-center"><Users className="mx-auto mb-4 h-8 w-8 text-primary" strokeWidth={1.4} /><h2 className="text-lg font-semibold">{search ? 'No members match your search' : data.total > 0 ? 'No members on this page' : 'No member records yet'}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{search ? 'Try a different name, member number, email or phone, or clear your search.' : data.total > 0 ? 'Return to the previous page to see the remaining records.' : 'Recorded member details will appear here. No member records have been added.'}</p></div> : <div data-testid="member-results">
          <div className="hidden md:block"><table className="w-full table-fixed text-left text-sm"><caption className="sr-only">Recorded members</caption><thead className="border-y border-border bg-secondary/40 text-xs text-muted-foreground"><tr><th className="w-[30%] px-6 py-3 font-medium">Member</th><th className="w-[30%] px-6 py-3 font-medium">Contact</th><th className="w-[23%] px-6 py-3 font-medium">Account link</th><th className="px-6 py-3 font-medium">Joined</th></tr></thead><tbody className="divide-y divide-border">{data.items.map(member => <tr key={member.id} className="align-top hover:bg-secondary/20"><td className="break-words px-6 py-5"><p className="font-semibold">{member.first_name} {member.last_name}</p><p className="mt-1 text-xs text-muted-foreground">{member.member_number}</p></td><td className="break-words px-6 py-5"><p>{member.email ?? 'No email recorded'}</p><p className="mt-1 text-xs text-muted-foreground">{member.phone ?? 'No phone recorded'}</p></td><td className="px-6 py-5"><AccountLink linked={member.user_id !== null} /></td><td className="px-6 py-5 text-xs text-muted-foreground">{joined(member.joined_at)}</td></tr>)}</tbody></table></div>
          <div className="divide-y divide-border border-t border-border md:hidden">{data.items.map(member => <article data-member-card key={member.id} className="space-y-4 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{member.first_name} {member.last_name}</h2><p className="mt-1 break-words text-xs text-muted-foreground">{member.member_number}</p></div><AccountLink linked={member.user_id !== null} /></div><dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs"><dt className="text-muted-foreground">Email</dt><dd className="break-words">{member.email ?? 'Not recorded'}</dd><dt className="text-muted-foreground">Phone</dt><dd className="break-words">{member.phone ?? 'Not recorded'}</dd><dt className="text-muted-foreground">Joined</dt><dd>{joined(member.joined_at)}</dd></dl></article>)}</div>
        </div>}
        <div className="flex flex-col items-start justify-between gap-4 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:px-6"><p className="text-xs text-muted-foreground">{data.items.length ? `${count(skip+1)}–${count(skip+data.items.length)} of ${count(data.total)}` : `0 shown of ${count(data.total)}`}</p><nav aria-label="Member pages" className="flex w-full items-center justify-between gap-3 sm:w-auto"><Button variant="outline" size="sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip-limit))}><ArrowLeft className="h-4 w-4" />Previous</Button><span className="text-xs tabular-nums text-muted-foreground">Page {Math.floor(skip/limit)+1} of {Math.max(1, Math.ceil(data.total/limit))}</span><Button variant="outline" size="sm" disabled={skip+limit >= data.total} onClick={() => setSkip(skip+limit)}>Next<ArrowRight className="h-4 w-4" /></Button></nav></div>
      </>}
    </section>
  </div>;
}
