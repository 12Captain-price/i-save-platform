import { createContext, useContext, useState, type ReactNode } from 'react';
import { initialPayments, initialApplications, initialTickets, staff, orgRoles, orgSettings, adminPlans, teamMembers, events, faqs, contactInfo, siteContent, registrationApplications, demoUsers, type Payment, type Application, type Ticket, type StaffMember, type RoleDef, type OrgSettings, type AdminPlan, type TeamMember, type Event, type FAQ, type ContactInfo, type SiteContent, type RegistrationApplication, type DemoUser } from '@/lib/portal/demo';
/**
 * SECURITY BOUNDARY NOTICE:
 * The authentication, role, and permission state managed here is prototype/demo behaviour only.
 * Frontend routing and hidden links do NOT provide security. The production backend MUST enforce
 * authentication, roles, and permissions on every protected request. This demo state resets on
 * refresh and is not persisted across users, browsers, or devices.
 */
type Audit = { id: string; action: string; reference: string; note: string; actor: string; date: string };
type DemoState = {
  payments: Payment[]; applications: Application[]; tickets: Ticket[]; audit: Audit[];
  announcements: { id: string; title: string; message: string }[];
  profile: { name: string; email: string; phone: string };
  staff: StaffMember[]; orgRoles: RoleDef[]; orgSettings: OrgSettings; adminPlans: AdminPlan[];
  team: TeamMember[]; events: Event[]; faqs: FAQ[]; contact: ContactInfo[]; content: SiteContent[]; registrations: RegistrationApplication[];
  currentUser: DemoUser | null;
  login: (user: DemoUser) => void;
  logout: () => void;
  setProfile: (profile: { name: string; email: string; phone: string }) => void;
  addPayment: (payment: Omit<Payment, 'id' | 'status' | 'reconciled'>) => void;
  verifyPayment: (id: string) => void; reconcile: (ids: string[]) => void;
  reversePayment: (id: string, note: string) => void; adjustPayment: (id: string, amount: number, note: string) => void;
  apply: (plan: string, note: string) => void; decide: (id: string, status: 'Approved' | 'Rejected', note: string) => void;
  addTicket: (subject: string, message: string) => void; replyTicket: (id: string, reply: string) => void;
  announce: (title: string, message: string) => void; editAnnouncement: (id: string, title: string, message: string) => void; removeAnnouncement: (id: string) => void;
  setStaff: (staff: StaffMember[]) => void; setStaffStatus: (id: string, status: 'Active' | 'Inactive') => void; addStaff: (member: Omit<StaffMember, 'id'>) => void; updateStaffRole: (id: string, role: StaffMember['role']) => void;
  setOrgSettings: (settings: Partial<OrgSettings>) => void;
  setRolePermissions: (id: 'member' | 'staff' | 'finance' | 'admin', permissions: string[]) => void;
  setPlanActive: (name: string, active: boolean) => void;
  setTeam: (team: TeamMember[]) => void; setTeamStatus: (id: string, published: boolean) => void; addTeam: (member: Omit<TeamMember, 'id'>) => void; updateTeam: (id: string, updates: Partial<TeamMember>) => void; removeTeam: (id: string) => void;
  setEvents: (events: Event[]) => void; setEventStatus: (id: string, published: boolean) => void; addEvent: (event: Omit<Event, 'id'>) => void; updateEvent: (id: string, updates: Partial<Event>) => void; removeEvent: (id: string) => void;
  setFaqs: (faqs: FAQ[]) => void; addFaq: (faq: Omit<FAQ, 'id'>) => void; updateFaq: (id: string, updates: Partial<FAQ>) => void; removeFaq: (id: string) => void; reorderFaqs: (ids: string[]) => void;
  setContact: (contact: ContactInfo[]) => void; updateContact: (id: string, value: string) => void;
  setContent: (content: SiteContent[]) => void; updateContent: (id: string, value: string) => void;
  addRegistration: (application: Omit<RegistrationApplication, 'id' | 'submittedAt' | 'passwordSet'>) => void; decideRegistration: (id: string, status: 'Approved' | 'Rejected', staffMember: string, note?: string) => void; requestMoreInfo: (id: string, note: string) => void; activateAccount: (id: string) => void; setVerificationCode: (id: string, code: string) => void; setPasswordSet: (id: string) => void;
};
const DemoContext = createContext<DemoState | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState(initialPayments);
  const [applications, setApplications] = useState(initialApplications);
  const [tickets, setTickets] = useState(initialTickets);
  const [profile, setProfile] = useState({ name: 'Tariro Moyo', email: 'tariro@example.com', phone: '' });
  const [staffState, setStaffState] = useState<StaffMember[]>(staff);
  const [orgRolesState, setOrgRolesState] = useState<RoleDef[]>(orgRoles);
  const [orgSettingsState, setOrgSettingsState] = useState<OrgSettings>(orgSettings);
  const [adminPlansState, setAdminPlansState] = useState<AdminPlan[]>(adminPlans);
  const [teamState, setTeamState] = useState<TeamMember[]>(teamMembers);
  const [eventsState, setEventsState] = useState<Event[]>(events);
  const [faqsState, setFaqsState] = useState<FAQ[]>(faqs);
  const [contactState, setContactState] = useState<ContactInfo[]>(contactInfo);
  const [contentState, setContentState] = useState<SiteContent[]>(siteContent);
  const [registrationsState, setRegistrationsState] = useState<RegistrationApplication[]>(registrationApplications);
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [audit, setAudit] = useState<Audit[]>([{ id: 'AUD-001', action: 'Record adjusted', reference: 'TX-2079', note: 'Demo correction to office reference; amount unchanged.', actor: 'Finance demo', date: '2026-10-08' }]);
  const [announcements, setAnnouncements] = useState([{ id: 'ANN-001', title: 'Your recorded contributions', message: 'Please keep your office receipt when making a contribution. Contact the team if a recorded payment needs checking.' }]);
  const log = (action: string, reference: string, note: string, actor = 'Finance demo') => setAudit(old => [{ id: `AUD-${Date.now()}`, action, reference, note, actor, date: new Date().toISOString().slice(0, 10) }, ...old]);
  const value: DemoState = {
    payments, applications, tickets, audit, announcements, profile, setProfile,
    staff: staffState, orgRoles: orgRolesState, orgSettings: orgSettingsState, adminPlans: adminPlansState,
    team: teamState, events: eventsState, faqs: faqsState, contact: contactState, content: contentState, registrations: registrationsState,
    currentUser,
    login: (user) => { setCurrentUser(user); log('Demo login', user.id, `Demo user ${user.name} signed in as ${user.role} with workspaces: ${user.workspaces.join(', ')}.`); },
    logout: () => { if (currentUser) log('Demo logout', currentUser.id, `Demo user ${currentUser.name} signed out.`); setCurrentUser(null); },
    addPayment: payment => { const id = `TX-D${Date.now()}`; setPayments(old => [{ ...payment, id, status: 'Pending verification', reconciled: false }, ...old]); log('Office payment recorded', id, 'Demonstration record, awaiting verification.', 'Staff demo'); },
    verifyPayment: id => { setPayments(old => old.map(p => p.id === id && p.status === 'Pending verification' ? { ...p, status: 'Verified' } : p)); log('Payment verified', id, 'Demo office receipt reviewed.'); },
    reconcile: ids => { setPayments(old => old.map(p => ids.includes(p.id) && p.status === 'Verified' ? { ...p, reconciled: true } : p)); log('Batch reconciled', ids.join(', '), 'Demo records matched to office receipt register.'); },
    reversePayment: (id, note) => { setPayments(old => old.map(p => p.id === id ? { ...p, status: 'Reversed', reconciled: false } : p)); log('Payment reversed', id, note); },
    adjustPayment: (id, amount, note) => { const previous = payments.find(p => p.id === id); if (!previous || !Number.isFinite(amount) || amount <= 0) return; setPayments(old => old.map(p => p.id === id ? { ...p, amount, status: 'Pending verification', reconciled: false } : p)); log('Amount adjusted', id, `${previous.amount} → ${amount} USD. ${note}`); },
    apply: (plan, note) => setApplications(old => [{ id: `APP-D${Date.now()}`, member: 'Tariro Moyo', memberId: 'IS-1042', plan, note, status: 'Pending', date: new Date().toISOString().slice(0, 10) }, ...old]),
    decide: (id, status, note) => { setApplications(old => old.map(a => a.id === id ? { ...a, status, note } : a)); log(`Application ${status.toLowerCase()}`, id, note, 'Staff demo'); },
    addTicket: (subject, message) => setTickets(old => [{ id: `SUP-D${Date.now()}`, member: 'Tariro Moyo', subject, message, status: 'Open', reply: '' }, ...old]),
    replyTicket: (id, reply) => setTickets(old => old.map(t => t.id === id ? { ...t, reply, status: 'Resolved' } : t)),
    announce: (title, message) => setAnnouncements(old => [{ id: `ANN-D${Date.now()}`, title, message }, ...old]),
    editAnnouncement: (id, title, message) => setAnnouncements(old => old.map(a => a.id === id ? { ...a, title, message } : a)),
    removeAnnouncement: (id) => setAnnouncements(old => old.filter(a => a.id !== id)),
    setStaff: (staff) => { setStaffState(staff); log('Staff records updated', staff.length.toString(), 'Demo organisation staff list adjusted.'); },
    setStaffStatus: (id, status) => { setStaffState(old => old.map(s => s.id === id ? { ...s, status } : s)); log('Staff status updated', id, `Set to ${status.toLowerCase()}.`); },
    addStaff: (member) => { const id = `ST-D${Date.now()}`; setStaffState(old => [{ id, ...member }, ...old]); log('Staff member added', id, 'Demo staff record created.'); },
    updateStaffRole: (id, role) => { setStaffState(old => old.map(s => s.id === id ? { ...s, role } : s)); log('Staff role updated', id, `Set to ${role}.`); },
    setOrgSettings: (settings) => { setOrgSettingsState(old => ({ ...old, ...settings })); log('Organisation settings updated', '', 'Demo configuration values adjusted.'); },
    setRolePermissions: (id, permissions) => { setOrgRolesState(old => old.map(r => r.id === id ? { ...r, permissions } : r)); log('Role permissions updated', id, 'Demo permission set adjusted.'); },
    setPlanActive: (name, active) => { setAdminPlansState(old => old.map(p => p.name === name ? { ...p, active } : p)); log('Savings plan updated', name, `Set ${active ? 'active' : 'inactive'}.`); },
    setTeam: (team) => { setTeamState(team); log('Team profiles updated', team.length.toString(), 'Demo team content adjusted.'); },
    setTeamStatus: (id, published) => { setTeamState(old => old.map(t => t.id === id ? { ...t, published } : t)); log('Team profile visibility updated', id, `Set to ${published ? 'published' : 'unpublished'}.`); },
    addTeam: (member) => { const id = `TM-D${Date.now()}`; setTeamState(old => [{ ...member, id, order: old.length + 1, published: true }, ...old]); log('Team member added', id, 'Demo team record created.'); },
    updateTeam: (id, updates) => { setTeamState(old => old.map(t => t.id === id ? { ...t, ...updates } : t)); log('Team profile updated', id, 'Demo team record adjusted.'); },
    removeTeam: (id) => { setTeamState(old => old.filter(t => t.id !== id)); log('Team member removed', id, 'Demo team record removed.'); },
    setEvents: (events) => { setEventsState(events); log('Events updated', events.length.toString(), 'Demo events adjusted.'); },
    setEventStatus: (id, published) => { setEventsState(old => old.map(e => e.id === id ? { ...e, published } : e)); log('Event visibility updated', id, `Set to ${published ? 'published' : 'unpublished'}.`); },
    addEvent: (event) => { const id = `EV-D${Date.now()}`; setEventsState(old => [{ ...event, id, published: true }, ...old]); log('Event added', id, 'Demo event created.'); },
    updateEvent: (id, updates) => { setEventsState(old => old.map(e => e.id === id ? { ...e, ...updates } : e)); log('Event updated', id, 'Demo event record adjusted.'); },
    removeEvent: (id) => { setEventsState(old => old.filter(e => e.id !== id)); log('Event removed', id, 'Demo event removed.'); },
    setFaqs: (faqs) => { setFaqsState(faqs); log('FAQs updated', faqs.length.toString(), 'Demo FAQs adjusted.'); },
    addFaq: (faq) => { const id = `FAQ-D${Date.now()}`; setFaqsState(old => [{ ...faq, id, order: old.length + 1, published: true }, ...old]); log('FAQ added', id, 'Demo FAQ created.'); },
    updateFaq: (id, updates) => { setFaqsState(old => old.map(f => f.id === id ? { ...f, ...updates } : f)); log('FAQ updated', id, 'Demo FAQ record adjusted.'); },
    removeFaq: (id) => { setFaqsState(old => old.filter(f => f.id !== id)); log('FAQ removed', id, 'Demo FAQ removed.'); },
    reorderFaqs: (ids) => { setFaqsState(old => ids.map((id, index) => { const f = old.find(x => x.id === id); return f ? { ...f, order: index + 1 } : null; }).filter((f): f is FAQ => f !== null)); log('FAQs reordered', ids.join(', '), 'Demo FAQ order adjusted.'); },
    setContact: (contact) => { setContactState(contact); log('Contact details updated', contact.length.toString(), 'Demo contact information adjusted.'); },
    updateContact: (id, value) => { setContactState(old => old.map(c => c.id === id ? { ...c, value } : c)); log('Contact detail updated', id, 'Demo contact detail adjusted.'); },
    setContent: (content) => { setContentState(content); log('Site content updated', content.length.toString(), 'Demo site content adjusted.'); },
    updateContent: (id, value) => { setContentState(old => old.map(c => c.id === id ? { ...c, value } : c)); log('Site content updated', id, 'Demo site content adjusted.'); },
    addRegistration: (application) => { const id = `REG-D${Date.now()}`; setRegistrationsState(old => [{ id, submittedAt: new Date().toISOString().slice(0, 10), passwordSet: false, ...application }, ...old]); log('Registration application received', id, 'Demo registration submitted.'); },
    decideRegistration: (id, status, staffMember, note) => { setRegistrationsState(old => old.map(r => { if (r.id !== id) return r; return { ...r, status, reviewedAt: new Date().toISOString().slice(0, 10), staffMember, rejectionReason: status === 'Rejected' ? note : undefined } as RegistrationApplication; })); log(`Registration ${status.toLowerCase()}`, id, `Reviewed by ${staffMember}. ${note ?? ''}`.trim()); },
    requestMoreInfo: (id, note) => { setRegistrationsState(old => old.map(r => { if (r.id !== id) return r; return { ...r, status: 'Additional Information Requested', rejectionReason: note } as RegistrationApplication; })); log('More information requested', id, note); },
    activateAccount: (id) => { setRegistrationsState(old => old.map(r => { if (r.id !== id) return r; return { ...r, status: 'Approved' } as RegistrationApplication; })); log('Account activated', id, 'Account activated.'); },
    setVerificationCode: (id, code) => { setRegistrationsState(old => old.map(r => { if (r.id !== id) return r; return { ...r, verificationCode: code } as RegistrationApplication; })); log('Verification code set', id, 'Demo verification code generated.'); },
    setPasswordSet: (id) => { setRegistrationsState(old => old.map(r => { if (r.id !== id) return r; return { ...r, passwordSet: true } as RegistrationApplication; })); log('Password set', id, 'Demo initial password established.'); },
  };
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('Demo screens require DemoProvider'); return context; }
