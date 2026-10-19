import { Building2, Plane, ShieldAlert, Briefcase, GraduationCap, LayoutDashboard, Layers, FileText, Wallet, UserRound, Bell, LifeBuoy, Users, UserPlus, User, List, ClipboardList, Megaphone, ShieldCheck, BookOpen, BarChart3, History, Settings } from 'lucide-react';
export type Role = 'member' | 'staff' | 'finance' | 'admin';
export const roles: Role[] = ['member', 'staff', 'finance', 'admin'];
export const plans = [
  { name: 'Asset Savings', icon: Building2, description: 'Put money aside for a significant purchase.' },
  { name: 'Holiday Savings', icon: Plane, description: 'Make space in your plans for time away.' },
  { name: 'Emergency Savings', icon: ShieldAlert, description: 'Prepare for life’s unexpected moments.' },
  { name: 'Retrenchment Savings', icon: Briefcase, description: 'Plan ahead for changes in employment.' },
  { name: 'Education Savings', icon: GraduationCap, description: 'Look ahead to school and study costs.' },
];
export const navigation = {
  member: [ { id: 'dashboard', label: 'Overview', icon: LayoutDashboard }, { id: 'plans', label: 'Savings plans', icon: Layers }, { id: 'plan-details', label: 'Plan details', icon: List }, { id: 'applications', label: 'Applications', icon: FileText }, { id: 'contributions', label: 'Contributions', icon: Wallet }, { id: 'profile', label: 'Profile & security', icon: UserRound }, { id: 'notifications', label: 'Notifications', icon: Bell }, { id: 'support', label: 'Support', icon: LifeBuoy } ],
  staff: [ { id: 'dashboard', label: 'Overview', icon: LayoutDashboard }, { id: 'members', label: 'Members', icon: Users }, { id: 'registrations', label: 'Registrations', icon: UserPlus }, { id: 'requests', label: 'Plan requests', icon: ClipboardList }, { id: 'payments', label: 'Office payments', icon: Wallet }, { id: 'support', label: 'Member support', icon: LifeBuoy }, { id: 'announcements', label: 'Announcements', icon: Megaphone } ],
  finance: [ { id: 'dashboard', label: 'Overview', icon: LayoutDashboard }, { id: 'verification', label: 'Payment verification', icon: ShieldCheck }, { id: 'reconciliation', label: 'Reconciliation', icon: ClipboardList }, { id: 'ledger', label: 'Contribution ledger', icon: BookOpen }, { id: 'fees', label: 'Subscription fees', icon: Wallet }, { id: 'reports', label: 'Reports', icon: BarChart3 }, { id: 'audit', label: 'Audit history', icon: History } ],
  admin: [ { id: 'dashboard', label: 'Organisation overview', icon: LayoutDashboard }, { id: 'members', label: 'Members', icon: Users }, { id: 'staff', label: 'Staff', icon: UserRound }, { id: 'roles', label: 'Roles & permissions', icon: ShieldCheck }, { id: 'plans', label: 'Savings plans', icon: Layers }, { id: 'finance', label: 'Finance oversight', icon: BarChart3 }, { id: 'audit', label: 'Activity log', icon: History }, { id: 'announcements', label: 'Announcements', icon: Megaphone }, { id: 'cms', label: 'Content management', icon: FileText }, { id: 'settings', label: 'Organisation settings', icon: Settings } ],
};
export function isRole(value: string): value is Role { return roles.some(role => role === value); }
export function validScreen(role: Role, screen: string) {
  return navigation[role].some(item => item.id === screen) || (role === 'member' && ['login', 'register', 'recovery', 'verify', 'setup-password'].includes(screen)) || (role === 'staff' && screen === 'member-record');
}
export function screenTitle(role: Role, screen: string) {
  return navigation[role].find(item => item.id === screen)?.label ?? ({ login: 'Member login', register: 'Member registration', recovery: 'Password recovery', verify: 'Email verification', 'setup-password': 'Set your password', 'member-record': 'Member record', 'plan-details': 'Plan details', cms: 'Content management', registrations: 'Registrations' }[screen] ?? 'Portal');
}
export type Payment = { id: string; member: string; memberId: string; date: string; plan: string; amount: number; kind: 'Savings contribution' | 'Subscription fee'; status: 'Verified' | 'Pending verification' | 'Reversed'; reconciled: boolean; reference: string };
export type Application = { id: string; member: string; memberId: string; plan: string; date: string; status: 'Pending' | 'Approved' | 'Rejected'; note: string };
export type Ticket = { id: string; member: string; subject: string; message: string; status: 'Open' | 'Resolved'; reply: string };
export const members = [
  { id: 'IS-1042', name: 'Tariro Moyo', initials: 'TM', email: 'tariro@example.com', joined: '14 Jul 2026', plans: ['Asset Savings', 'Education Savings'] },
  { id: 'IS-1043', name: 'Nyasha Dube', initials: 'ND', email: 'nyasha@example.com', joined: '22 Jul 2026', plans: ['Holiday Savings'] },
  { id: 'IS-1044', name: 'Kudzai Ncube', initials: 'KN', email: 'kudzai@example.com', joined: '03 Aug 2026', plans: ['Emergency Savings'] },
  { id: 'IS-1045', name: 'Rudo Chirwa', initials: 'RC', email: 'rudo@example.com', joined: '18 Aug 2026', plans: ['Retrenchment Savings'] },
];
export const initialPayments: Payment[] = [
  { id: 'TX-2086', member: 'Tariro Moyo', memberId: 'IS-1042', date: '2026-10-15', plan: 'Asset Savings', amount: 150, kind: 'Savings contribution', status: 'Pending verification', reconciled: false, reference: 'OFF-086' },
  { id: 'TX-2085', member: 'Nyasha Dube', memberId: 'IS-1043', date: '2026-10-14', plan: 'Holiday Savings', amount: 80, kind: 'Savings contribution', status: 'Pending verification', reconciled: false, reference: 'OFF-085' },
  { id: 'TX-2084', member: 'Tariro Moyo', memberId: 'IS-1042', date: '2026-10-10', plan: 'Education Savings', amount: 100, kind: 'Savings contribution', status: 'Verified', reconciled: false, reference: 'OFF-084' },
  { id: 'TX-2083', member: 'Kudzai Ncube', memberId: 'IS-1044', date: '2026-10-09', plan: 'Emergency Savings', amount: 60, kind: 'Savings contribution', status: 'Verified', reconciled: false, reference: 'OFF-083' },
  { id: 'TX-2082', member: 'Tariro Moyo', memberId: 'IS-1042', date: '2026-10-08', plan: 'Subscription', amount: 5, kind: 'Subscription fee', status: 'Verified', reconciled: true, reference: 'OFF-082' },
  { id: 'TX-2081', member: 'Tariro Moyo', memberId: 'IS-1042', date: '2026-09-15', plan: 'Asset Savings', amount: 200, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-081' },
  { id: 'TX-2080', member: 'Tariro Moyo', memberId: 'IS-1042', date: '2026-08-15', plan: 'Asset Savings', amount: 250, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-080' },
  { id: 'TX-2079', member: 'Rudo Chirwa', memberId: 'IS-1045', date: '2026-10-07', plan: 'Retrenchment Savings', amount: 90, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-079' },
  { id: 'TX-2078', member: 'Tariro Moyo', memberId: 'IS-1042', date: '2026-09-20', plan: 'Asset Savings', amount: 180, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-087' },
  { id: 'TX-2077', member: 'Nyasha Dube', memberId: 'IS-1043', date: '2026-09-18', plan: 'Holiday Savings', amount: 90, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-088' },
  { id: 'TX-2076', member: 'Kudzai Ncube', memberId: 'IS-1044', date: '2026-09-10', plan: 'Emergency Savings', amount: 70, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-089' },
  { id: 'TX-2075', member: 'Rudo Chirwa', memberId: 'IS-1045', date: '2026-09-05', plan: 'Retrenchment Savings', amount: 85, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-090' },
  { id: 'TX-2074', member: 'Tariro Moyo', memberId: 'IS-1042', date: '2026-08-22', plan: 'Asset Savings', amount: 220, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-091' },
  { id: 'TX-2073', member: 'Nyasha Dube', memberId: 'IS-1043', date: '2026-08-15', plan: 'Holiday Savings', amount: 110, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-092' },
  { id: 'TX-2072', member: 'Kudzai Ncube', memberId: 'IS-1044', date: '2026-08-08', plan: 'Emergency Savings', amount: 60, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-093' },
  { id: 'TX-2071', member: 'Rudo Chirwa', memberId: 'IS-1045', date: '2026-08-01', plan: 'Retrenchment Savings', amount: 100, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-094' },
  { id: 'TX-2070', member: 'Tariro Moyo', memberId: 'IS-1042', date: '2026-07-28', plan: 'Asset Savings', amount: 160, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-095' },
  { id: 'TX-2069', member: 'Nyasha Dube', memberId: 'IS-1043', date: '2026-07-15', plan: 'Holiday Savings', amount: 100, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-096' },
  { id: 'TX-2068', member: 'Kudzai Ncube', memberId: 'IS-1044', date: '2026-07-10', plan: 'Emergency Savings', amount: 50, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-097' },
  { id: 'TX-2067', member: 'Rudo Chirwa', memberId: 'IS-1045', date: '2026-07-03', plan: 'Retrenchment Savings', amount: 90, kind: 'Savings contribution', status: 'Verified', reconciled: true, reference: 'OFF-098' },
];
export const initialApplications: Application[] = [
  { id: 'APP-031', member: 'Tariro Moyo', memberId: 'IS-1042', plan: 'Holiday Savings', date: '2026-10-14', status: 'Pending', note: 'Planning for time away next year.' },
  { id: 'APP-030', member: 'Kudzai Ncube', memberId: 'IS-1044', plan: 'Emergency Savings', date: '2026-10-12', status: 'Approved', note: 'Building a reserve for unexpected expenses.' },
  { id: 'APP-029', member: 'Rudo Chirwa', memberId: 'IS-1045', plan: 'Education Savings', date: '2026-10-10', status: 'Rejected', note: 'Demo decision: requested information was not provided.' },
];
export const initialTickets: Ticket[] = [ { id: 'SUP-018', member: 'Tariro Moyo', subject: 'Contribution receipt', message: 'Could you check the receipt for my latest office contribution?', status: 'Open', reply: '' }, { id: 'SUP-017', member: 'Nyasha Dube', subject: 'Plan information', message: 'Where can I get the confirmed plan details?', status: 'Resolved', reply: 'Please speak with the office team for the approved plan information.' } ];
export type StaffMember = { id: string; name: string; initials: string; email: string; role: 'staff' | 'finance' | 'admin'; status: 'Active' | 'Inactive'; joined: string };
export type RoleDef = { id: Role; name: string; description: string; permissions: string[]; members: number };
export type OrgSettings = { name: string; currency: string; location: string; registrationFee: number; monthlyFee: number; feeNote: string };
export type AdminPlan = { name: string; description: string; active: boolean };
export const staff: StaffMember[] = [
  { id: 'ST-201', name: 'Samantha Khumalo', initials: 'SK', email: 'samantha@example.com', role: 'staff', status: 'Active', joined: '10 Mar 2026' },
  { id: 'FN-302', name: 'David Moyo', initials: 'DM', email: 'david@example.com', role: 'finance', status: 'Active', joined: '05 Feb 2026' },
  { id: 'ST-203', name: 'Grace Mhlanga', initials: 'GM', email: 'grace@example.com', role: 'staff', status: 'Inactive', joined: '18 Jan 2026' },
];
export const orgRoles: RoleDef[] = [
  { id: 'member', name: 'Member', description: 'View own savings, plans and contributions.', permissions: ['view:own-savings', 'submit:applications', 'edit:own-profile'], members: 4 },
  { id: 'staff', name: 'Staff', description: 'Supports members and records office payments.', permissions: ['view:members', 'record:payments', 'review:applications', 'reply:support'], members: 0 },
  { id: 'finance', name: 'Finance', description: 'Verifies, reconciles and reports on payments.', permissions: ['view:ledger', 'verify:payments', 'reconcile:payments', 'export:reports'], members: 0 },
  { id: 'admin', name: 'Administrator', description: 'Organisation-wide administration and settings.', permissions: ['manage:staff', 'manage:roles', 'manage:plans', 'manage:announcements', 'manage:settings', 'view:audit'], members: 0 },
];
export const orgSettings: OrgSettings = { name: 'i-Save Savings Organisation', currency: 'USD', location: 'Harare, Zimbabwe', registrationFee: 20, monthlyFee: 5, feeNote: 'Unconfirmed configuration values used for demonstration only — not approved policy.' };
export const adminPlans: AdminPlan[] = [
  { name: 'Asset Savings', description: 'Put money aside for a significant purchase.', active: true },
  { name: 'Holiday Savings', description: 'Make space in your plans for time away.', active: true },
  { name: 'Emergency Savings', description: 'Prepare for life’s unexpected moments.', active: true },
  { name: 'Retrenchment Savings', description: 'Plan ahead for changes in employment.', active: true },
  { name: 'Education Savings', description: 'Look ahead to school and study costs.', active: true },
];
export function savingsTotal(payments: Payment[], memberId?: string) { return payments.filter(p => p.kind === 'Savings contribution' && p.status === 'Verified' && (!memberId || p.memberId === memberId)).reduce((sum, p) => sum + p.amount, 0); }
export function feeTotal(payments: Payment[]) { return payments.filter(p => p.kind === 'Subscription fee' && p.status === 'Verified').reduce((sum, p) => sum + p.amount, 0); }
export function filterPayments(payments: Payment[], from: string, to: string, search = '', status = 'All') { return payments.filter(p => (!from || p.date >= from) && (!to || p.date <= to) && (status === 'All' || p.status === status) && `${p.id} ${p.member} ${p.plan} ${p.reference}`.toLowerCase().includes(search.toLowerCase())); }
export const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
export const displayDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

export type TeamMember = { id: string; name: string; role: string; bio: string; image: string; order: number; published: boolean };
export type Event = { id: string; title: string; date: string; description: string; category: string; image: string; published: boolean };
export type FAQ = { id: string; question: string; answer: string; category: string; order: number; published: boolean };
export type ContactInfo = { id: string; label: string; value: string; type: 'email' | 'phone' | 'address' | 'web'; order: number };
export type SiteContent = { id: string; section: string; key: string; value: string; published: boolean };
export type RegistrationApplication = { id: string; firstName: string; lastName: string; email: string; phone: string; address: string; reason: string; status: 'Submitted' | 'Additional Information Requested' | 'Approved' | 'Rejected'; registeredBy: 'self' | 'staff'; staffMember?: string; submittedAt: string; reviewedAt?: string; rejectionReason?: string; verificationCode?: string; passwordSet: boolean };
export type DemoUser = { id: string; name: string; role: Role; workspaces: Role[]; permissions: string[]; email: string; password: string };

export function canAccessWorkspace(user: DemoUser, targetRole: Role): boolean {
  // A user can always enter their own assigned role workspace
  if (user.role === targetRole) return true;

  // Admin users can access all workspaces
  if (user.role === 'admin') return true;

  // Permission required to enter other workspaces
  const permissionMap: Record<Role, string> = {
    member: 'view:own-savings',
    staff: 'view:members',
    finance: 'verify:payments',
    admin: 'manage:settings',
  };

  return user.permissions.includes(permissionMap[targetRole]);
}

export const demoUsers: DemoUser[] = [
  { id: 'DU-1001', name: 'Tariro Moyo', role: 'member', workspaces: ['member'], permissions: ['view:own-savings', 'submit:applications', 'edit:own-profile'], email: 'tariro@example.com', password: 'member123' },
  { id: 'DU-2001', name: 'Samantha Khumalo', role: 'staff', workspaces: ['staff', 'finance', 'admin'], permissions: ['view:members', 'record:payments', 'review:applications', 'reply:support', 'verify:payments'], email: 'samantha@example.com', password: 'staff123' },
  { id: 'DU-2002', name: 'David Moyo', role: 'finance', workspaces: ['finance', 'staff', 'admin'], permissions: ['view:ledger', 'verify:payments', 'reconcile:payments', 'export:reports'], email: 'david@example.com', password: 'finance123' },
  { id: 'DU-2003', name: 'Grace Mhlanga', role: 'staff', workspaces: ['staff', 'finance', 'admin'], permissions: ['view:members', 'record:payments', 'review:applications', 'reply:support', 'manage:settings'], email: 'grace@example.com', password: 'staff123' },
  { id: 'DU-3001', name: 'Admin User', role: 'admin', workspaces: ['admin', 'staff', 'finance'], permissions: ['manage:staff', 'manage:roles', 'manage:plans', 'manage:announcements', 'manage:settings', 'view:audit'], email: 'admin@example.com', password: 'admin123' },
];
export const teamMembers: TeamMember[] = [
  { id: 'TM-001', name: 'Tariro Moyo', role: 'Member Experience Lead', bio: 'Tariro leads member engagement and support at i-Save, helping members reach their savings goals.', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop', order: 1, published: true },
  { id: 'TM-002', name: 'Samantha Khumalo', role: 'Member Services Officer', bio: 'Samantha assists members with applications, contributions and account queries at the office.', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop', order: 2, published: true },
  { id: 'TM-003', name: 'David Moyo', role: 'Finance Officer', bio: 'David oversees payment verification, reconciliation and financial reporting.', image: 'https://images.unsplash.com/photo-1507003211169-0a1272e8e0ea?w=400&h=400&fit=crop', order: 3, published: true },
];
export const events: Event[] = [
  { id: 'EV-001', title: 'Savings Workshop: Building Your Emergency Fund', date: '2026-11-15', description: 'Join us for a practical session on building an emergency savings buffer. Open to all members.', category: 'Workshop', image: 'https://images.unsplash.com/photo-1544367567-0f28b003003b?w=800&h=400&fit=crop', published: true },
  { id: 'EV-002', title: 'Annual General Meeting 2026', date: '2026-12-05', description: 'All members are invited to the annual general meeting. Hear about the organisation’s progress and plans for the year ahead.', category: 'Meeting', image: 'https://images.unsplash.com/photo-1515528844448-d8750597990c?w=800&h=400&fit=crop', published: true },
  { id: 'EV-003', title: 'Financial Literacy Seminar', date: '2027-01-20', description: 'Learn about savings plans, budgeting and financial planning for individuals and families.', category: 'Seminar', image: 'https://images.unsplash.com/photo-1524407017219-bb68f8b1e4e5?w=800&h=400&fit=crop', published: true },
];
export const faqs: FAQ[] = [
  { id: 'FAQ-001', question: 'Who can join i-Save?', answer: 'Membership is open to individuals who wish to save with the organisation. Contact the office for current eligibility requirements.', category: 'Membership', order: 1, published: true },
  { id: 'FAQ-002', question: 'How do I make a contribution?', answer: 'Contributions are made in person at the organisation’s office. Authorised staff record each payment, and you can view your recorded savings online.', category: 'Contributions', order: 2, published: true },
  { id: 'FAQ-003', question: 'What savings plans are available?', answer: 'The organisation offers Asset Savings, Holiday Savings, Emergency Savings, Retrenchment Savings and Education Savings plans. Approved terms are provided by the organisation.', category: 'Plans', order: 3, published: true },
  { id: 'FAQ-004', question: 'Are there fees?', answer: 'Provisional figures of a $20 one-time registration fee and a $5 monthly subscription fee are shown for demonstration only. These have not been approved as final policy.', category: 'Fees', order: 4, published: true },
  { id: 'FAQ-005', question: 'How long does registration approval take?', answer: 'Registrations are reviewed by authorised staff. You will be notified of the outcome by email once a decision has been made.', category: 'Membership', order: 5, published: true },
  { id: 'FAQ-006', question: 'Can I apply for more than one savings plan?', answer: 'Yes, members can hold more than one savings plan. Speak with the office team about combining plans.', category: 'Plans', order: 6, published: true },
];
export const contactInfo: ContactInfo[] = [
  { id: 'CON-001', label: 'Email', value: 'info@isave.org.zw', type: 'email', order: 1 },
  { id: 'CON-002', label: 'Phone', value: '+263 4 123 4567', type: 'phone', order: 2 },
  { id: 'CON-003', label: 'Office', value: 'Harare, Zimbabwe', type: 'address', order: 3 },
  { id: 'CON-004', label: 'Website', value: 'isave.org.zw', type: 'web', order: 4 },
];
export const siteContent: SiteContent[] = [
  { id: 'SC-001', section: 'homepage', key: 'eyebrow', value: 'Savings, structured', published: true },
  { id: 'SC-002', section: 'homepage', key: 'headline', value: 'Your future, built one saving at a time.', published: true },
  { id: 'SC-003', section: 'homepage', key: 'description', value: 'A clearer way to build your savings, track your progress and plan for what matters.', published: true },
  { id: 'SC-004', section: 'about', key: 'title', value: 'About i-Save', published: true },
  { id: 'SC-005', section: 'about', key: 'content', value: 'i-Save is a savings platform for members of a Zimbabwean savings organisation. Members contribute at the office and authorised staff record each payment. Members can view their recorded savings, plan applications and contribution history online.', published: true },
  { id: 'SC-006', section: 'footer', key: 'copyright', value: '© {year} i-Save', published: true },
  { id: 'SC-007', section: 'footer', key: 'attribution', value: 'An initiative of Zimbabwe Progressive Youth Foundation', published: true },
  { id: 'SC-008', section: 'contact', key: 'email', value: 'info@isave.org.zw', published: true },
  { id: 'SC-009', section: 'contact', key: 'phone', value: '+263 4 123 4567', published: true },
  { id: 'SC-010', section: 'contact', key: 'address', value: 'Harare, Zimbabwe', published: true },
];
export const registrationApplications: RegistrationApplication[] = [];
