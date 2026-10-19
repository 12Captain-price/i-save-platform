import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Users, ClipboardList, Wallet, LifeBuoy, Plus, Search, ArrowRight, Check, X, Megaphone, UserPlus, Mail, Clock } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { useDemo } from './DemoProvider';
import { PageHeading, Stats, SectionHeading, DataTable, Cell, Status, Field, Modal, Notice, Empty, inputClass, textareaClass } from './PortalUI';
import { PaymentTable } from './MemberScreens';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusChart } from './AdminCharts';
import { members, plans, money, savingsTotal, displayDate, type Application, type Ticket } from '@/lib/portal/demo';

export function StaffScreens({ screen, memberId }: { screen: string; memberId: string }) {
  if (screen === 'dashboard') return <StaffOverview />;
  if (screen === 'members') return <MemberSearch />;
  if (screen === 'member-record') return <MemberRecord memberId={memberId} />;
  if (screen === 'requests') return <Requests />;
  if (screen === 'payments') return <OfficePayments />;
  if (screen === 'announcements') return <Announcements />;
  if (screen === 'registrations') return <Registrations />;
  return <StaffSupport />;
}

function StaffOverview() {
  const { applications, payments, tickets } = useDemo();
  const pending = applications.filter(a => a.status === 'Pending');
  const approved = applications.filter(a => a.status === 'Approved').length;
  const rejected = applications.filter(a => a.status === 'Rejected').length;
  const requestStatusData = [{ name: 'Pending', value: pending.length }, { name: 'Approved', value: approved }, { name: 'Rejected', value: rejected }].filter(d => d.value > 0);

  return (
    <>
      <PageHeading
        eyebrow="Staff workspace"
        title="A clear start to your day."
        description="Review member requests, record office contributions and keep members informed."
        action={
          <Button asChild>
            <Link to="/portal/$role/$screen" params={{ role: 'staff', screen: 'payments' }}>
              <Plus /> Record office payment
            </Link>
          </Button>
        }
      />
      <Stats
        items={[
          { label: 'Demo members', value: members.length, detail: 'Sample member records', icon: Users },
          { label: 'Pending requests', value: pending.length, detail: 'Ready for staff review', icon: ClipboardList },
          { label: 'Payments to verify', value: payments.filter(p => p.status === 'Pending verification').length, detail: 'In the finance review queue', icon: Wallet },
          { label: 'Open support requests', value: tickets.filter(t => t.status === 'Open').length, detail: 'Awaiting a team response', icon: LifeBuoy },
        ]}
      />
      <div className="mb-10 grid gap-8 md:grid-cols-3">
        {[
          { screen: 'requests', title: 'Review plan requests', text: 'Pending applications and member goals.', icon: ClipboardList },
          { screen: 'members', title: 'Find a member', text: 'Profiles and recorded contributions.', icon: Users },
          { screen: 'support', title: 'Respond to support', text: 'Questions from demonstration members.', icon: LifeBuoy },
        ].map((i) => (
          <Link
            key={i.screen}
            to="/portal/$role/$screen"
            params={{ role: 'staff', screen: i.screen }}
            className="group border-t border-border py-6"
            onClick={() => {}}
          >
            <i.icon className="h-6 w-6 text-portal-accent" />
            <h2 className="mt-4 flex items-center justify-between text-base font-semibold">
              {i.title}
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{i.text}</p>
          </Link>
        ))}
      </div>
      <div className="mb-10 grid gap-8 xl:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionHeading title="Payment status" />
          <StatusChart payments={payments} />
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionHeading title="Plan request status" />
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={requestStatusData}>
                <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#02F5A1" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <SectionHeading title="Requests needing attention" />
      <RequestTable applications={pending} />
      {pending.length === 0 && <Empty text="All demonstration requests have been reviewed." />}
    </>
  );
}

function MemberSearch() {
  const [query, setQuery] = useState('');
  const filtered = members.filter(m => `${m.id} ${m.name} ${m.email}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageHeading
        eyebrow="Member records"
        title="Find the right member."
        description="Search sample member records by name, member ID or demonstration email."
      />
      <label className="relative mb-7 block max-w-lg">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <input
          className={`${inputClass} pl-10`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search members"
          placeholder="Search name, member ID or email"
        />
      </label>
      <DataTable headers={['Member', 'Member ID', 'Savings categories', 'Joined', 'Record']}>
        {filtered.map((m) => (
          <tr key={m.id}>
            <Cell>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs text-primary">{m.initials}</span>
                <div>
                  {m.name}
                  <span className="block text-xs text-muted-foreground">{m.email}</span>
                </div>
              </div>
            </Cell>
            <Cell>{m.id}</Cell>
            <Cell>{m.plans.join(', ')}</Cell>
            <Cell>{m.joined}</Cell>
            <Cell>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/portal/$role/$screen" params={{ role: 'staff', screen: 'member-record' }} search={{ member: m.id }}>
                  View <ArrowRight />
                </Link>
              </Button>
            </Cell>
          </tr>
        ))}
      </DataTable>
      {filtered.length === 0 && <Empty />}
    </>
  );
}

function MemberRecord({ memberId }: { memberId: string }) {
  const { payments, applications } = useDemo();
  const member = members.find(m => m.id === memberId);
  if (!member) {
    return (
      <>
        <PageHeading eyebrow="Member records" title="Member not found" description="Select one of the available demonstration records." />
        <Button asChild>
          <Link to="/portal/$role/$screen" params={{ role: 'staff', screen: 'members' }}>
            Back to members
          </Link>
        </Button>
      </>
    );
  }
  return (
    <>
      <PageHeading
        eyebrow={`Member ${member.id}`}
        title={member.name}
        description={`${member.email} · Joined ${member.joined} · Demonstration record`}
        action={
          <Button variant="outline" asChild>
            <Link to="/portal/$role/$screen" params={{ role: 'staff', screen: 'members' }}>
              Back to members
            </Link>
          </Button>
        }
      />
      <Stats
        items={[
          { label: 'Recorded savings', value: money(savingsTotal(payments, member.id)), detail: 'Verified savings only · Demo USD', icon: Wallet },
          { label: 'Savings categories', value: member.plans.length, detail: member.plans.join(' & '), icon: ClipboardList },
          { label: 'Recorded payments', value: payments.filter(p => p.memberId === member.id).length, detail: 'Includes pending records and fees', icon: Wallet },
          { label: 'Applications', value: applications.filter(a => a.memberId === member.id).length, detail: 'Sample plan requests', icon: Users },
        ]}
      />
      <SectionHeading title="Contribution history" />
      <PaymentTable payments={payments.filter(p => p.memberId === member.id)} />
      <section className="mt-10">
        <SectionHeading title="Plan requests" />
        <RequestTable applications={applications.filter(a => a.memberId === member.id)} />
      </section>
    </>
  );
}

function RequestTable({ applications, onReview }: { applications: Application[]; onReview?: (a: Application) => void }) {
  return (
    <DataTable
      headers={['Request', 'Member', 'Plan', 'Submitted', 'Status', ...(onReview ? ['Review'] : [])]}
    >
      {applications.map((a) => (
        <tr key={a.id}>
          <Cell>{a.id}</Cell>
          <Cell>{a.member}</Cell>
          <Cell>{a.plan}</Cell>
          <Cell>{displayDate(a.date)}</Cell>
          <Cell><Status status={a.status} /></Cell>
          {onReview && (
            <Cell>
              <Button size="sm" variant="outline" onClick={() => onReview(a)}>
                {a.status === 'Pending' ? 'Review' : 'Details'}
              </Button>
            </Cell>
          )}
        </tr>
      ))}
    </DataTable>
  );
}

function Requests() {
  const { applications, decide } = useDemo();
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState<Application | null>(null);
  const [notice, setNotice] = useState('');
  const [decision, setDecision] = useState<'Approved' | 'Rejected'>('Approved');
  const filtered = applications.filter(a => filter === 'All' || a.status === filter);

  return (
    <>
      <PageHeading
        eyebrow="Member applications"
        title="Plan requests"
        description="Review a savings goal and preview a staff decision. No real plan membership is changed."
      />
      {notice && <Notice>{notice}</Notice>}
      <Field label="Request status">
        <select
          className={`${inputClass} mb-6 max-w-xs`}
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          {['All', 'Pending', 'Approved', 'Rejected'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <RequestTable
        applications={filtered}
        onReview={(a) => { setSelected(a); setDecision('Approved'); }}
      />
      {filtered.length === 0 && <Empty />}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Review demonstration request"
        description="A visual staff decision only; no membership or eligibility is established."
      >
        {selected && (
          <>
            <p className="text-sm font-semibold">{selected.member} · {selected.plan}</p>
            <p className="text-sm text-muted-foreground">{selected.note}</p>
            <Status status={selected.status} />
            {selected.status === 'Pending' && (
              <form
                className="mt-4 space-y-5"
                onSubmit={e => {
                  e.preventDefault();
                  const note = String(new FormData(e.currentTarget).get('note'));
                  decide(selected.id, decision, note);
                  setNotice(`${selected.id} marked ${decision.toLowerCase()} in the demonstration.`);
                  setSelected(null);
                }}
              >
                <Field label="Decision">
                  <select
                    className={inputClass}
                    value={decision}
                    onChange={e => setDecision(e.target.value === 'Rejected' ? 'Rejected' : 'Approved')}
                  >
                    <option>Approved</option>
                    <option>Rejected</option>
                  </select>
                </Field>
                <Field label="Review note">
                  <textarea required name="note" className={textareaClass} placeholder="Explain the decision..." />
                </Field>
                <Button type="submit" className="w-full">
                  Save demo decision <ArrowRight />
                </Button>
              </form>
            )}
            {selected.status !== 'Pending' && (
              <p className="text-sm text-muted-foreground">This {selected.status} request has already been reviewed.</p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

function OfficePayments() {
  const { payments, addPayment } = useDemo();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('Savings contribution');
  const [notice, setNotice] = useState('');

  return (
    <>
      <PageHeading
        eyebrow="Physical office payments"
        title="Record a contribution."
        description="Capture a demonstration office receipt. New records appear in Finance for verification; no money is moved."
        action={<Button onClick={() => setOpen(true)}><Plus /> Record demo payment</Button>}
      />
      {notice && <Notice>{notice}</Notice>}
      <DataTable headers={['Reference', 'Member', 'Date', 'Category', 'Demo USD', 'Status']}>
        {payments.map((p) => (
          <tr key={p.id}>
            <Cell>{p.reference}</Cell>
            <Cell>{p.member}</Cell>
            <Cell>{displayDate(p.date)}</Cell>
            <Cell>
              {p.plan}
              <span className="block text-xs text-muted-foreground">{p.kind}</span>
            </Cell>
            <Cell>{money(p.amount)}</Cell>
            <Cell><Status status={p.status} /></Cell>
          </tr>
        ))}
      </DataTable>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record office payment"
        description="Record office payments."
      >
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const member = members.find(m => m.id === data.get('member'));
            if (!member) return;
            addPayment({
              member: member.name,
              memberId: member.id,
              date: String(data.get('date')),
              amount: Number(data.get('amount')),
              reference: String(data.get('reference')),
              kind: kind === 'Subscription fee' ? 'Subscription fee' : 'Savings contribution',
              plan: kind === 'Subscription fee' ? 'Subscription' : String(data.get('plan')),
            });
            setNotice('Demo office payment recorded as pending verification. Explore Finance to review it.');
            setOpen(false);
          }}
        >
          <Field label="Member">
            <select required name="member" className={inputClass}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Payment type">
            <select className={inputClass} value={kind} onChange={e => setKind(e.target.value)}>
              <option>Savings contribution</option>
              <option>Subscription fee</option>
            </select>
          </Field>
          <Field label="Plan (savings contributions only)">
            <select name="plan" className={inputClass}>
              {plans.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount (demo USD)">
            <input type="number" name="amount" required className={inputClass} placeholder="0" />
          </Field>
          <Field label="Office reference">
            <input name="reference" required className={inputClass} placeholder="e.g. OFF-099" />
          </Field>
          <Field label="Date">
            <input type="date" name="date" required className={inputClass} />
          </Field>
          <Button type="submit" className="w-full">
            Record demo payment <ArrowRight />
          </Button>
        </form>
      </Modal>
    </>
  );
}

function StaffSupport() {
  const { tickets, replyTicket } = useDemo();
  const [selected, setSelected] = useState<Ticket | null>(null);

  return (
    <>
      <PageHeading
        eyebrow="Member conversations"
        title="Support workspace"
        description="Review demonstration requests and preview a response from the office team."
      />
      <DataTable headers={['Request', 'Member', 'Subject', 'Status', 'Conversation']}>
        {tickets.map((t) => (
          <tr key={t.id}>
            <Cell>{t.id}</Cell>
            <Cell>{t.member}</Cell>
            <Cell>{t.subject}</Cell>
            <Cell><Status status={t.status} /></Cell>
            <Cell>
              <Button variant="outline" size="sm" onClick={() => setSelected(t)}>
                Open request
              </Button>
            </Cell>
          </tr>
        ))}
      </DataTable>
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject ?? 'Support request'}
        description="Demonstration conversation only. No message is delivered externally."
      >
        {selected && (
          <>
            <p className="text-xs text-muted-foreground">{selected.member} · {selected.id}</p>
            <p className="text-sm">{selected.message}</p>
            {selected.reply && (
              <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">{selected.reply}</p>
            )}
            <form
              className="mt-4 space-y-4"
              onSubmit={e => {
                e.preventDefault();
                replyTicket(selected.id, String(new FormData(e.currentTarget).get('reply')));
                setSelected(null);
              }}
            >
              <Field label="Team response">
                <textarea name="reply" required className={textareaClass} />
              </Field>
              <Button type="submit">Save demo reply & resolve</Button>
            </form>
          </>
        )}
      </Modal>
    </>
  );
}

function Announcements() {
  const { announcements, announce } = useDemo();
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeading
        eyebrow="Keep members informed"
        title="Announcements"
        description="Draft and manage member announcements. Published announcements appear in member notifications."
        action={<Button onClick={() => setOpen(true)}><Plus /> New announcement</Button>}
      />
      <div className="divide-y divide-border border-y border-border">
        {announcements.map((a) => (
          <article key={a.id} className="flex gap-4 py-6">
            <Megaphone className="h-6 w-6 shrink-0 text-portal-accent" />
            <div>
              <h2 className="text-lg font-semibold">{a.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.message}</p>
              <p className="mt-3 text-xs text-muted-foreground">Demo audience: members · {a.id}</p>
            </div>
          </article>
        ))}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New demonstration announcement"
        description="No email or external notification will be sent."
      >
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            announce(String(data.get('title')), String(data.get('message')));
            setOpen(false);
          }}
        >
          <Field label="Title">
            <input required name="title" className={inputClass} />
          </Field>
          <Field label="Message">
            <textarea required name="message" className={textareaClass} />
          </Field>
          <Button type="submit">Publish demo announcement</Button>
        </form>
      </Modal>
    </>
  );
}

function Registrations() {
  const { registrations, addRegistration, decideRegistration, requestMoreInfo, activateAccount, setVerificationCode, setPasswordSet } = useDemo();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [newReg, setNewReg] = useState({ firstName: '', lastName: '', email: '', phone: '', address: '', reason: '', registeredBy: 'staff' as const });

  return (
    <>
      <PageHeading
        eyebrow="Member registration"
        title="Registration applications"
        description="Review and manage membership registration applications. Staff-assisted and self-submitted applications appear here."
        action={<Button onClick={() => { setSelected(null); setOpen(true); }}><UserPlus /> Staff-assisted registration</Button>}
      />
      {notice && <Notice>{notice}</Notice>}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {registrations.map((reg) => (
          <Card key={reg.id} className="rounded-xl border border-border bg-card p-6 flex flex-col">
            <div className="flex-1">
              <p className="text-sm font-semibold">{reg.firstName} {reg.lastName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{reg.email}</p>
              <p className="mt-2 text-xs text-muted-foreground">{reg.registeredBy === 'staff' ? 'Staff-assisted' : 'Self-submitted'} · {reg.submittedAt}</p>
              <p className="mt-2 text-xs text-muted-foreground">{reg.reason}</p>
              <Status status={reg.status} />
            </div>
            <div className="flex gap-2 mt-4">
              {reg.status === 'Submitted' && (
                <>
                  <Button variant="outline" size="sm" onClick={() => { setSelected(reg); setOpen(true); }}>Review</Button>
                  <Button variant="outline" size="sm" onClick={() => requestMoreInfo(reg.id, 'Additional information required.')}>Request info</Button>
                </>
              )}
              {reg.status === 'Approved' && (
                <Button variant="outline" size="sm" onClick={() => { activateAccount(reg.id); setNotice(`Account activated for ${reg.firstName} ${reg.lastName}.`); }}>Activate account</Button>
              )}
              {reg.status === 'Additional Information Requested' && (
                <Button variant="outline" size="sm" onClick={() => { setSelected(reg); setOpen(true); }}>Review</Button>
              )}
            </div>
          </Card>
        ))}
        {registrations.length === 0 && <Empty text="No registration applications." />}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={selected ? `Review: ${selected.firstName} ${selected.lastName}` : 'Staff-assisted registration'}
        description="Demo registration workflow — no real account is created."
      >
        {selected && (
          <>
            <p className="text-sm">{selected.firstName} {selected.lastName} · {selected.email}</p>
            <p className="mt-2 text-sm text-muted-foreground">{selected.reason}</p>
            <Status status={selected.status} />
            {selected.status === 'Submitted' || selected.status === 'Additional Information Requested' && (
              <form className="mt-4 space-y-5" onSubmit={e => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const decision = String(data.get('decision'));
                const note = String(data.get('note'));
                if (decision === 'reject') {
                  decideRegistration(selected.id, 'Rejected', 'Staff demo', note);
                } else {
                  decideRegistration(selected.id, 'Approved', 'Staff demo', note);
                  setVerificationCode(selected.id, '123456');
                }
                setNotice(`Registration ${decision === 'reject' ? 'rejected' : 'approved'} in the demonstration.`);
                setSelected(null);
                setOpen(false);
              }}
              >
                <Field label="Decision">
                  <select className={inputClass} value="approve" onChange={e => {}}>
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                  </select>
                </Field>
                <Field label="Review note">
                  <textarea name="note" className={textareaClass} placeholder="Add review notes..." />
                </Field>
                <Button type="submit" className="w-full">Save demo decision <ArrowRight /></Button>
              </form>
            )}
            {selected.status === 'Approved' && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">Account approved. Next steps:</p>
                <Button variant="outline" size="sm" onClick={() => { setVerificationCode(selected.id, '123456'); setNotice(`Verification code set for ${selected.email}.`); }}>Set verification code</Button>
                <Button variant="outline" size="sm" onClick={() => { activateAccount(selected.id); setNotice(`Account activated for ${selected.firstName} ${selected.lastName}.`); }}>Activate account</Button>
              </div>
            )}
            {selected.status === 'Rejected' && (
              <p className="mt-2 text-sm text-muted-foreground">Rejection reason: {selected.rejectionReason ?? 'Not specified'}</p>
            )}
          </>
        )}
        {!selected && (
          <form className="space-y-5 max-w-lg" onSubmit={e => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            addRegistration({
              firstName: String(data.get('firstName')),
              lastName: String(data.get('lastName')),
              email: String(data.get('email')),
              phone: String(data.get('phone')),
              address: String(data.get('address')),
              reason: String(data.get('reason')),
              registeredBy: 'staff',
              status: 'Submitted',
            });
            setNotice(`Staff-assisted registration submitted for ${data.get('firstName')} ${data.get('lastName')}.`);
            setNewReg({ firstName: '', lastName: '', email: '', phone: '', address: '', reason: '', registeredBy: 'staff' });
            setOpen(false);
          }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="First name"><input required name="firstName" value={newReg.firstName} onChange={e => setNewReg({ ...newReg, firstName: e.target.value })} className={inputClass} /></Field>
              <Field label="Last name"><input required name="lastName" value={newReg.lastName} onChange={e => setNewReg({ ...newReg, lastName: e.target.value })} className={inputClass} /></Field>
            </div>
            <Field label="Email address"><input type="email" required name="email" value={newReg.email} onChange={e => setNewReg({ ...newReg, email: e.target.value })} className={inputClass} /></Field>
            <Field label="Phone number"><input name="phone" value={newReg.phone} onChange={e => setNewReg({ ...newReg, phone: e.target.value })} className={inputClass} /></Field>
            <Field label="Address"><input name="address" value={newReg.address} onChange={e => setNewReg({ ...newReg, address: e.target.value })} className={inputClass} /></Field>
            <Field label="Reason for registration"><textarea required name="reason" value={newReg.reason} onChange={e => setNewReg({ ...newReg, reason: e.target.value })} className={textareaClass} /></Field>
            <Button type="submit" className="w-full">Submit demo registration <ArrowRight /></Button>
          </form>
        )}
      </Modal>
    </>
  );
}