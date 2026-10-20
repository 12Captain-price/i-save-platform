import { Link, Navigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Menu, X, ChevronRight, LogOut, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { navigation, screenTitle, type Role } from '@/lib/portal/navigation';
import { OrganisationOverview, MembersDirectory } from './AdminDataScreens';
import { MemberOverview } from './MemberOverview';
import { MemberFees } from './MembershipReview';
import { ApplicationScreens } from './ApplicationScreens';
import { AssistedRegistration } from '@/components/auth/AssistedRegistration';

function SessionGate() {
  const auth = useAuth();
  if (auth.status === 'loading') return <div className="min-h-screen bg-background px-6 py-20 text-center" role="status">Checking your session…</div>;
  if (auth.status === 'error') return <div className="min-h-screen bg-background px-6 py-20 text-center"><p role="alert">{auth.notice}</p><Button className="mt-4" onClick={() => void auth.refresh()}>Try again</Button></div>;
  return <Navigate to="/login" replace />;
}

export function WorkspaceEntry() {
  const auth = useAuth();
  if (auth.status !== 'ready' || !auth.identity) return <SessionGate />;
  return auth.identity.workspace ? <Navigate to="/portal/$role/$screen" params={{ role: auth.identity.workspace, screen: 'dashboard' }} replace /> : <Navigate to="/login" replace />;
}

export function AuthenticatedWorkspace({ role, screen }: { role: Role; screen: string }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (auth.status !== 'ready' || !auth.identity) return <SessionGate />;
  const workspace = auth.identity.workspace;
  if (!workspace) return <Navigate to="/login" replace />;
  if (workspace !== role) return <div className="min-h-screen bg-background px-6 py-20 text-center"><h1 className="text-2xl">Access denied</h1><p className="mt-3">Your account is not assigned to this workspace.</p><Button className="mt-5" asChild><Link to="/portal/$role/$screen" params={{ role: workspace, screen: 'dashboard' }}>Your workspace</Link></Button></div>;
  const roleName = role === 'admin' ? 'Admin' : role.charAt(0).toUpperCase() + role.slice(1);
  return <div className={`portal-theme portal-${role} min-h-screen bg-background text-foreground`}>
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface-deep transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-24 items-center justify-between px-7"><Link to="/" aria-label="i-Save public website"><img src="/images/isave-logo-dark.png" alt="i-Save" width={1983} height={793} className="h-10 w-auto" /></Link><Button variant="ghost" size="icon" aria-label="Close portal menu" className="lg:hidden" onClick={() => setOpen(false)}><X /></Button></div>
      <div className="mx-5 mb-8 flex items-center gap-2 border-l-2 border-portal-accent bg-portal-accent/10 px-3 py-2 text-xs font-semibold text-portal-accent"><span className="h-1.5 w-1.5 rounded-full bg-portal-accent" />{roleName} portal</div>
      <nav aria-label={`${roleName} portal navigation`} className="flex-1 space-y-1 overflow-y-auto px-4">{navigation[role].map(item => <Link key={item.id} to="/portal/$role/$screen" params={{ role, screen: item.id }} onClick={() => setOpen(false)} aria-current={screen === item.id ? 'page' : undefined} className={`flex items-center gap-3 rounded-md px-4 py-3 text-sm transition-colors ${screen === item.id ? 'bg-portal-accent/10 font-semibold text-portal-accent' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}><item.icon size={19} strokeWidth={1.7} />{item.label}</Link>)}</nav>
      <div className="space-y-4 border-t border-border p-5"><Link to="/" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary"><ArrowUpRight size={17} />Public website</Link><div className="flex items-center gap-2 text-[10px] text-muted-foreground">An initiative of <img src="/images/zpyf-logo.png" alt="Zimbabwe Progressive Youth Foundation" className="h-5 w-auto rounded-sm bg-foreground/95 px-1" /></div></div>
    </aside>
    {open && <div className="fixed inset-0 z-30 bg-background/80 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
    <div className="min-w-0 lg:pl-64"><header className="flex min-h-20 items-center justify-between gap-3 border-b border-border px-5 md:px-10"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" aria-label="Open portal menu" className="shrink-0 lg:hidden" onClick={() => setOpen(true)}><Menu /></Button><span className="hidden text-sm text-muted-foreground sm:inline">{roleName} portal</span><ChevronRight className="hidden h-3 w-3 text-muted-foreground sm:block" /><span className="truncate text-sm">{screenTitle(role, screen)}</span></div><div className="flex shrink-0 items-center gap-3"><span className="hidden max-w-48 truncate text-right text-xs sm:block">{auth.identity.user.email}</span><Button variant="ghost" size="icon" aria-label="Log out" title="Log out" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await auth.logout(); } catch { setError('Could not sign out. Your session may still be active. Please try again.'); } finally { setBusy(false); }
    }}><LogOut /></Button></div></header>
      <main id="portal-main" className="mx-auto max-w-[1500px] px-5 py-8 md:px-10 md:py-10">
        {error && <p role="alert" className="mb-5 text-sm text-destructive">{error}</p>}
        <div className="mb-8"><p className="mb-2 text-xs font-semibold uppercase text-portal-accent">{roleName} workspace</p><h1 className="text-3xl font-semibold leading-tight md:text-4xl">{screenTitle(role, screen)}</h1></div>
        {role === 'member' && screen === 'dashboard' ? <MemberOverview/> : role === 'member' && screen === 'fees' ? <MemberFees/> : (role === 'admin' || role === 'staff') && screen === 'assist-registration' ? <AssistedRegistration /> : (role === 'admin' || role === 'staff') && screen === 'registrations' ? <ApplicationScreens /> : role === 'admin' && screen === 'dashboard' ? <OrganisationOverview /> : role === 'admin' && screen === 'members' ? <MembersDirectory /> : <section className="rounded-md border border-border bg-card p-7" role="status"><h2 className="text-xl font-semibold">This screen is not available yet</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">You are signed in. This part of your workspace is not connected yet. Please contact the office for assistance.</p></section>}
      </main><footer className="px-5 pb-8 text-xs text-muted-foreground md:px-10">i-Save · Office payments only</footer>
    </div>
  </div>;
}
