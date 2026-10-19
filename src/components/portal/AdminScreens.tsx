import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Users, UserRound, ShieldCheck, Layers, BarChart3, History, Megaphone, Settings, Search, Plus, ArrowRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDemo } from './DemoProvider';
import { PageHeading, Stats, SectionHeading, DataTable, Cell, Status, Modal, Field, Notice, Empty, inputClass, textareaClass } from './PortalUI';
import { members, staff, orgRoles, orgSettings, adminPlans, money, savingsTotal, displayDate, type RoleDef, type OrgSettings, type StaffMember } from '@/lib/portal/demo';
import { SavingsTrendChart, PlanBreakdownChart, StatusChart } from './AdminCharts';
import { AdminContentManagement } from './AdminContentManagement';

export function AdminScreens({ screen }: { screen: string }) {
  if (screen === 'dashboard') return <AdminDashboard />;
  if (screen === 'members') return <AdminMembers />;
  if (screen === 'staff') return <AdminStaff />;
  if (screen === 'roles') return <AdminRoles />;
  if (screen === 'plans') return <AdminPlans />;
  if (screen === 'finance') return <AdminFinance />;
  if (screen === 'audit') return <AdminAudit />;
  if (screen === 'announcements') return <AdminAnnouncements />;
  if (screen === 'cms') return <AdminContentManagement />;
  return <AdminSettings />;
}

function AdminDashboard() {
  const { payments, applications, tickets, announcements } = useDemo();
  const verifiedSavings = savingsTotal(payments);
  const pending = payments.filter(p => p.status === 'Pending verification');
  const unmatched = payments.filter(p => p.status === 'Verified' && !p.reconciled);
  return (<>
    <PageHeading eyebrow="Organisation overview" title="i-Save at a glance" description="Organisation administration workspace." />
    <Stats items={[
      { label: 'Verified savings', value: money(verifiedSavings), detail: 'Demo USD · savings contributions only', icon: Users },
      { label: 'Pending verification', value: pending.length, detail: `${money(pending.reduce((s, p) => s + p.amount, 0))} in sample records`, icon: ShieldCheck },
      { label: 'To reconcile', value: unmatched.length, detail: 'Verified records not yet matched', icon: BarChart3 },
      { label: 'Members', value: members.length, detail: 'Sample member records', icon: Users },
    ]} />
    <div className="mb-10 grid gap-8 xl:grid-cols-2">
      <SavingsTrendChart payments={payments} />
      <PlanBreakdownChart payments={payments} />
    </div>
    <SectionHeading title="Recent activity" /><AdminAuditLog payments={payments} applications={applications} tickets={tickets} announcements={announcements} limit={6} />
  </>);
}

function AdminMembers() {
  const { payments, applications } = useDemo();
  const [query, setQuery] = useState('');
  const filtered = members.filter(m => `${m.id} ${m.name} ${m.email}`.toLowerCase().includes(query.toLowerCase()));
  return (<>
    <PageHeading eyebrow="Member management" title="Members" description="Review sample member records and their recorded savings." action={<Button variant="outline" asChild><Link to="/portal/$role/$screen" params={{ role: 'staff', screen: 'members' }}>Open staff member directory</Link></Button>} />
    <label className="relative mb-7 block max-w-lg"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input className={`${inputClass} pl-10`} value={query} onChange={e => setQuery(e.target.value)} aria-label="Search members" placeholder="Search name, member ID or email" /></label>
    <DataTable headers={['Member', 'Member ID', 'Savings categories', 'Recorded savings', 'Record']}>
      {filtered.map(m => <tr key={m.id}>
        <Cell><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs text-primary">{m.initials}</span><div>{m.name}<span className="block text-xs text-muted-foreground">{m.email}</span></div></div></Cell>
        <Cell>{m.id}</Cell>
        <Cell>{m.plans.join(', ')}</Cell>
        <Cell>{money(savingsTotal(payments, m.id))}</Cell>
        <Cell><Button variant="ghost" size="sm" asChild><Link to="/portal/$role/$screen" params={{ role: 'staff', screen: 'member-record' }} search={{ member: m.id }}>View <ArrowRight /></Link></Button></Cell>
      </tr>)}
      {filtered.length === 0 && <Empty />}
    </DataTable>
  </>);
}

function AdminStaff() {
  const { staff, setStaff, setStaffStatus, addStaff, updateStaffRole } = useDemo();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const filtered = staff.filter(s => `${s.name} ${s.email} ${s.role}`.toLowerCase().includes(query.toLowerCase()));
  return (<>
    <PageHeading eyebrow="Staff management" title="Staff" description="Manage demonstration staff records. No real employment is created or changed." action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus />Add staff member</Button>} />
    <label className="relative mb-7 block max-w-lg"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input className={`${inputClass} pl-10`} value={query} onChange={e => setQuery(e.target.value)} aria-label="Search staff" placeholder="Search name, email or role" /></label>
    <DataTable headers={['Staff member', 'Email', 'Role', 'Status', 'Joined', 'Actions']}>
      {filtered.map(s => <tr key={s.id}>
        <Cell><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs text-primary">{s.initials}</span><div>{s.name}<span className="block text-xs text-muted-foreground">{s.email}</span></div></div></Cell>
        <Cell>{s.email}</Cell>
        <Cell>{s.role}</Cell>
        <Cell><Status status={s.status} /></Cell>
        <Cell>{s.joined}</Cell>
        <Cell><div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(s); setOpen(true); }}>Edit</Button>
          <Button variant="outline" size="sm" onClick={() => setStaffStatus(s.id, s.status === 'Active' ? 'Inactive' : 'Active')}>
            {s.status === 'Active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div></Cell>
      </tr>)}
    </DataTable>
    <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit staff member' : 'Add staff member'} description="Demonstration record only. No real account is created.">
      <form className="space-y-5" onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (editing) {
          setStaff(staff.map(s => s.id === editing.id ? { ...s, name: String(data.get('name')), email: String(data.get('email')), role: String(data.get('role')) as StaffMember['role'] } : s));
          setEditing(null);
        } else {
          addStaff({ name: String(data.get('name')), email: String(data.get('email')), initials: String(data.get('initials')), role: String(data.get('role')) as StaffMember['role'], status: 'Active', joined: new Date().toISOString().slice(0, 10) });
        }
        setOpen(false);
      }}>
        <Field label="Display name"><input required name="name" defaultValue={editing?.name ?? ''} className={inputClass} /></Field>
        <Field label="Email address"><input type="email" required name="email" defaultValue={editing?.email ?? ''} className={inputClass} /></Field>
        <Field label="Role"><select required name="role" defaultValue={editing?.role ?? 'staff'} className={inputClass}><option>staff</option><option>finance</option><option>admin</option></select></Field>
        {!editing && <Field label="Initials"><input required name="initials" maxLength={3} defaultValue={''} className={inputClass} placeholder="e.g. AB" /></Field>}
        <Button type="submit" className="w-full">{editing ? 'Save demo changes' : 'Add demo staff member'} <ArrowRight /></Button>
      </form>
    </Modal>
  </>);
}

function AdminRoles() {
  const { orgRoles, setRolePermissions } = useDemo();
  return (<>
    <PageHeading eyebrow="Roles & permissions" title="Role management" description="Review and adjust demonstration permission sets. These are visual controls only." />
    <DataTable headers={['Role', 'Description', 'Members', 'Permissions', 'Actions']}>
      {orgRoles.map(r => <tr key={r.id}>
        <Cell>{r.name}</Cell>
        <Cell>{r.description}</Cell>
        <Cell>{r.members}</Cell>
        <Cell>{r.permissions.join(', ')}</Cell>
        <Cell><Button variant="outline" size="sm" onClick={() => {
          const next = window.prompt(`Permissions for ${r.name} (comma separated)`, r.permissions.join(', '));
          if (next !== null) setRolePermissions(r.id as any, next.split(',').map(s => s.trim()).filter(Boolean));
        }}>Edit permissions</Button></Cell>
      </tr>)}
    </DataTable>
    <p className="mt-6 text-xs text-muted-foreground">Permission codes shown are demonstration labels only; no real access control is enforced.</p>
  </>);
}

function AdminPlans() {
  const { adminPlans, setPlanActive } = useDemo();
  return (<>
    <PageHeading eyebrow="Savings plan administration" title="Savings plans" description="Toggle whether each savings plan category is offered. Approved terms are provided by the organisation." />
    <DataTable headers={['Plan', 'Description', 'Status', 'Action']}>
      {adminPlans.map(p => <tr key={p.name}>
        <Cell>{p.name}</Cell>
        <Cell>{p.description}</Cell>
        <Cell><Status status={p.active ? 'Active' : 'Inactive'} /></Cell>
        <Cell><Button variant="outline" size="sm" onClick={() => setPlanActive(p.name, !p.active)}>{p.active ? 'Deactivate' : 'Activate'}</Button></Cell>
      </tr>)}
    </DataTable>
    <p className="mt-6 text-xs text-muted-foreground">Plan details and eligibility are set by the organisation; this screen only toggles visibility in the demonstration.</p>
  </>);
}

function AdminFinance() {
  const { payments } = useDemo();
  const pending = payments.filter(p => p.status === 'Pending verification');
  const unmatched = payments.filter(p => p.status === 'Verified' && !p.reconciled);
  return (<>
    <PageHeading eyebrow="Finance oversight" title="Finance overview" description="Organisation-wide view of payment records, verification and reconciliation status." />
    <Stats items={[
      { label: 'Office records', value: payments.length, detail: 'All sample payment records', icon: BarChart3 },
      { label: 'Verified savings', value: money(savingsTotal(payments)), detail: 'Savings contributions only', icon: Users },
      { label: 'Pending verification', value: pending.length, detail: `${money(pending.reduce((s, p) => s + p.amount, 0))} awaiting review`, icon: ShieldCheck },
      { label: 'To reconcile', value: unmatched.length, detail: 'Verified records not yet matched', icon: Download },
    ]} />
    <div className="mb-10 grid gap-8 xl:grid-cols-2">
      <StatusChart payments={payments} />
      <PlanBreakdownChart payments={payments} />
    </div>
    <SectionHeading title="Records awaiting verification" />
    <DataTable headers={['Office reference', 'Member', 'Date', 'Category', 'Demo USD', 'Action']}>
      {pending.map(p => <tr key={p.id}>
        <Cell><span className="font-medium">{p.reference}</span><span className="mt-1 block text-xs text-muted-foreground">{p.id}</span></Cell>
        <Cell>{p.member}</Cell>
        <Cell>{displayDate(p.date)}</Cell>
        <Cell>{p.plan}</Cell>
        <Cell>{money(p.amount)}</Cell>
        <Cell><Button variant="outline" size="sm" asChild><Link to="/portal/$role/$screen" params={{ role: 'finance', screen: 'verification' }}>Review <ArrowRight /></Link></Button></Cell>
      </tr>)}
      {pending.length === 0 && <Empty text="No records awaiting verification." />}
    </DataTable>
  </>);
}

function AdminAudit() {
  const { audit } = useDemo();
  const [query, setQuery] = useState('');
  const filtered = audit.filter(a => `${a.action} ${a.reference} ${a.note} ${a.actor}`.toLowerCase().includes(query.toLowerCase()));
  return (<>
    <PageHeading eyebrow="Activity log" title="Audit history" description="Review sample adjustments, reversals and workflow decisions made during this demonstration visit." />
    <Field label="Search audit entries"><input className={`${inputClass} mb-6 max-w-lg`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Action, reference or reason" /></Field>
    <DataTable headers={['Date', 'Action', 'Reference', 'Reviewer', 'Reason / details']}>
      {filtered.map(a => <tr key={a.id}>
        <Cell>{displayDate(a.date)}</Cell>
        <Cell><span className="flex items-center gap-2"><History className="h-4 w-4 shrink-0 text-portal-accent" />{a.action}</span></Cell>
        <Cell><span className="break-all">{a.reference}</span></Cell>
        <Cell>{a.actor}</Cell>
        <Cell>{a.note}</Cell>
      </tr>)}
      {filtered.length === 0 && <Empty />}
    </DataTable>
  </>);
}

function AdminAnnouncements() {
  const { announcements, announce, editAnnouncement, removeAnnouncement } = useDemo();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string; message: string } | null>(null);
  return (<>
    <PageHeading eyebrow="Announcements" title="Announcement management" description="Draft and manage member updates. Published announcements appear in member notifications." action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus />New announcement</Button>} />
    <div className="divide-y divide-border border-y border-border">
      {announcements.map(a => <article key={a.id} className="flex gap-4 py-6">
        <Megaphone className="h-6 w-6 shrink-0 text-portal-accent" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{a.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.message}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditing({ id: a.id, title: a.title, message: a.message }); setOpen(true); }}>Edit</Button>
          <Button variant="destructive" size="sm" onClick={() => { removeAnnouncement(a.id); }}>Remove</Button>
        </div>
      </article>)}
      {announcements.length === 0 && <Empty text="No announcements published." />}
    </div>
    <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit announcement' : 'New announcement'} description="No email or external notification will be sent.">
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (editing) editAnnouncement(editing.id, String(data.get('title')), String(data.get('message')));
        else announce(String(data.get('title')), String(data.get('message')));
        setEditing(null); setOpen(false);
      }}>
        <Field label="Title"><input required name="title" defaultValue={editing?.title ?? ''} className={inputClass} /></Field>
        <Field label="Message"><textarea required name="message" defaultValue={editing?.message ?? ''} className={textareaClass} /></Field>
        <Button type="submit" className="w-full">{editing ? 'Save demo announcement' : 'Publish demo announcement'} <ArrowRight /></Button>
      </form>
    </Modal>
  </>);
}

function AdminSettings() {
  const { orgSettings, setOrgSettings } = useDemo();
  const [saved, setSaved] = useState(false);
  return (<>
    <PageHeading eyebrow="Organisation settings" title="Settings" description="Review and adjust demonstration configuration values. These do not establish real policy." />
    <p className="mb-6 text-sm text-muted-foreground">Fee figures shown ($20 registration, $5 monthly) are unconfirmed configuration values used for demonstration only — not approved policy.</p>
    <form className="space-y-5 max-w-lg" onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      setOrgSettings({ name: String(data.get('name')), currency: String(data.get('currency')), location: String(data.get('location')), registrationFee: Number(data.get('registrationFee')), monthlyFee: Number(data.get('monthlyFee')) });
      setSaved(true);
    }}>
      <Field label="Organisation name"><input required name="name" defaultValue={orgSettings.name} className={inputClass} /></Field>
      <Field label="Currency"><input required name="currency" defaultValue={orgSettings.currency} className={inputClass} /></Field>
      <Field label="Location"><input required name="location" defaultValue={orgSettings.location} className={inputClass} /></Field>
      <Field label="Registration fee (USD)"><input type="number" required name="registrationFee" defaultValue={String(orgSettings.registrationFee)} className={inputClass} /><p className="text-xs text-muted-foreground">Unconfirmed — not approved policy.</p></Field>
      <Field label="Monthly fee (USD)"><input type="number" required name="monthlyFee" defaultValue={String(orgSettings.monthlyFee)} className={inputClass} /><p className="text-xs text-muted-foreground">Unconfirmed — not approved policy.</p></Field>
      <Button type="submit" className="w-full">Save settings <ArrowRight /></Button>
      {saved && <Notice>Settings saved.</Notice>}
    </form>
  </>);
}

function AdminAuditLog({ payments, applications, tickets, announcements, limit }: { payments: any[]; applications: any[]; tickets: any[]; announcements: any[]; limit: number }) {
  const log: Array<{ date: string; action: string; reference: string; actor: string; note: string }> = [];
  payments.slice().reverse().slice(0, 3).forEach(p => log.push({ date: p.date, action: 'Office payment recorded', reference: p.id, actor: 'Staff demo', note: `${p.member} · ${money(p.amount)}` }));
  applications.slice().reverse().slice(0, 2).forEach(a => log.push({ date: a.date, action: 'Application submitted', reference: a.id, actor: 'Member demo', note: `${a.plan} · ${a.status}` }));
  tickets.slice().reverse().slice(0, 1).forEach(t => log.push({ date: new Date().toISOString().slice(0, 10), action: 'Support request', reference: t.id, actor: 'Member demo', note: t.subject }));
  log.sort((a, b) => b.date.localeCompare(a.date));
  const shown = log.slice(0, limit);
  return (<div className="space-y-3">
    {shown.map((entry, i) => <div key={i} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <History className="mt-1 h-4 w-4 shrink-0 text-portal-accent" />
      <div className="flex-1">
        <p className="text-sm">{entry.action}</p>
        <p className="text-xs text-muted-foreground">{entry.reference} · {entry.note}</p>
      </div>
      <span className="text-xs text-muted-foreground">{entry.date}</span>
    </div>)}
    {shown.length === 0 && <p className="text-sm text-muted-foreground">No recent activity.</p>}
  </div>);
}
