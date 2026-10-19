import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowUpRight, ArrowLeft, Menu, X, ChevronRight, FlaskConical, LogOut, ArrowRight, UserRound, Users, ShieldCheck, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
const logo = '/images/isave-logo-dark.png';
const zpyf = '/images/zpyf-logo.png';
import { navigation, screenTitle, type Role, type DemoUser, canAccessWorkspace } from '@/lib/portal/demo';
import { useDemo } from './DemoProvider';
export { useDemo };

export const WORKSPACE_LABELS: Record<Role, { label: string; icon: React.ElementType }> = {
  member: { label: 'Member', icon: UserRound },
  staff: { label: 'Staff', icon: Users },
  finance: { label: 'Finance', icon: ShieldCheck },
  admin: { label: 'Admin', icon: Settings },
};
export function PortalShell({ role, screen, children }: { role: Role; screen: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const roleName = role.charAt(0).toUpperCase() + role.slice(1);
  const items = navigation[role];
  const { currentUser, logout } = useDemo();
  const showSwitcher = currentUser && (role === 'staff' || role === 'admin');
  return <div className={`portal-theme portal-${role} min-h-screen bg-background text-foreground`}>
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface-deep transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-24 items-center justify-between px-7"><Link to="/" aria-label="i-Save public website"><img src={logo} alt="i-Save" width={1983} height={793} className="h-10 w-auto" /></Link><Button variant="ghost" size="icon" aria-label="Close portal menu" className="lg:hidden" onClick={() => setOpen(false)}><X /></Button></div>
      <div className="mx-5 mb-8 flex items-center gap-2 border-l-2 border-portal-accent bg-portal-accent/10 px-3 py-2 text-xs font-semibold text-portal-accent"><span className="h-1.5 w-1.5 rounded-full bg-portal-accent" />{roleName} portal</div>
      {showSwitcher && currentUser && (
        <div className="mx-5 mb-6">
          <WorkspaceSwitcher currentUser={currentUser} />
        </div>
      )}
      <nav aria-label={`${roleName} portal navigation`} className="flex-1 space-y-1 overflow-y-auto px-4">{items.map(item => <Link key={item.id} to="/portal/$role/$screen" params={{ role, screen: item.id }} onClick={() => setOpen(false)} aria-current={screen === item.id ? 'page' : undefined} className={`flex items-center gap-3 rounded-md px-4 py-3 text-sm transition-colors ${screen === item.id ? 'bg-portal-accent/10 font-semibold text-portal-accent' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}><item.icon size={19} strokeWidth={1.7} />{item.label}</Link>)}</nav>
      <div className="space-y-4 border-t border-border p-5"><Link to="/portal" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={17} />Switch portal</Link><Link to="/" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary"><ArrowUpRight size={17} />Public website</Link><div className="flex items-center gap-2 text-[10px] text-muted-foreground">An initiative of <img src={zpyf} alt="Zimbabwe Progressive Youth Foundation" width={1536} height={1024} className="h-5 w-auto rounded-sm bg-foreground/95 px-1" /></div></div>
    </aside>
    {open && <div className="fixed inset-0 z-30 bg-background/80 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
    <div className="lg:pl-64"><header className="flex min-h-20 items-center justify-between gap-3 border-b border-border px-5 md:px-10"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" aria-label="Open portal menu" className="lg:hidden" onClick={() => setOpen(true)}><Menu /></Button><span className="hidden text-sm text-muted-foreground sm:inline">{roleName} portal</span><ChevronRight className="hidden h-3 w-3 text-muted-foreground sm:block" /><span className="text-sm">{screenTitle(role, screen)}</span></div><div className="flex items-center gap-3"><span className="hidden text-right text-xs sm:block">{role === 'member' ? 'Tariro Moyo' : `${roleName} reviewer`}</span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-portal-accent">{role === 'member' ? 'TM' : role === 'staff' ? 'ST' : 'FN'}</span><Button variant="ghost" size="icon" asChild><Link to="/portal" aria-label="Leave demonstration portal" title="Leave demonstration portal"><LogOut /></Link></Button></div></header>

      <main id="portal-main" className="mx-auto max-w-[1500px] px-5 py-8 md:px-10 md:py-10">{children}</main><footer className="px-5 pb-8 text-xs text-muted-foreground md:px-10">i-Save · Office payments only</footer>
    </div>
  </div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-xs font-semibold uppercase text-portal-accent">{eyebrow}</p><h1 className="text-3xl font-semibold leading-tight md:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>{action}</div>; }
export function Stats({ items }: { items: { label: string; value: string | number; detail: string; icon: React.ElementType }[] }) { return <div className="mb-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map(item => <div key={item.label} className="rounded-md border border-border bg-card p-5"><div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">{item.label}<item.icon className="h-5 w-5 text-portal-accent" strokeWidth={1.5} /></div><p className="mt-5 font-display text-3xl font-semibold">{item.value}</p><p className="mt-2 text-xs text-muted-foreground">{item.detail}</p></div>)}</div>; }
export function Status({ status }: { status: string }) { const style = ['Verified', 'Approved', 'Resolved', 'Reconciled'].includes(status) ? 'bg-primary/10 text-primary' : ['Rejected', 'Reversed'].includes(status) ? 'bg-destructive/10 text-destructive' : 'bg-portal-warm/10 text-portal-warm'; return <span className={`inline-flex whitespace-nowrap rounded-sm px-2 py-1 text-[11px] font-medium ${style}`}>{status}</span>; }
export function SectionHeading({ title, children }: { title: string; children?: ReactNode }) { return <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2>{children}</div>; }
export function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-secondary/60 text-xs text-muted-foreground"><tr>{headers.map(h => <th key={h} scope="col" className="px-5 py-4 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-border bg-card/30">{children}</tbody></table></div>; }
export const Cell = ({ children }: { children: ReactNode }) => <td className="px-5 py-4">{children}</td>;
export function Empty({ text = 'No demonstration records match your filters.' }: { text?: string }) { return <p className="py-10 text-center text-sm text-muted-foreground" role="status">{text}</p>; }
export function Notice({ children }: { children: ReactNode }) { return <div role="status" className="my-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">{children}</div>; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
export const inputClass = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:border-primary';
export const textareaClass = 'min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus:border-primary';
export function Modal({ title, description, open, onClose, children }: { title: string; description: string; open: boolean; onClose: () => void; children: ReactNode }) { return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="portal-theme max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>; }
export function downloadDemo(filename: string, rows: string[][]) { const text = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob(['DEMONSTRATION DATA — NOT AN OFFICIAL FINANCIAL DOCUMENT\r\n', text], { type: 'text/csv;charset=utf-8;' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }

const WorkspaceIcon = ({ role, className }: { role: Role; className?: string }) => {
  const Icon = WORKSPACE_LABELS[role].icon;
  return <Icon className={className} />;
};

export function WorkspaceSwitcher({ currentUser }: { currentUser: DemoUser }) {
  const [open, setOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState<Role | null>(null);
  const navigate = useNavigate();
  const workspaces = currentUser.workspaces.filter(w => w === 'member' || w === 'staff' || w === 'finance' || w === 'admin');

  const handleSwitch = (ws: Role) => {
    if (ws === currentUser.role) {
      setOpen(false);
      setAccessDenied(null);
      return;
    }
    if (!canAccessWorkspace(currentUser, ws)) {
      setAccessDenied(ws);
      setOpen(false);
      return;
    }
    const defaultScreen = navigation[ws][0]?.id ?? 'dashboard';
    setOpen(false);
    setAccessDenied(null);
    navigate({ to: '/portal/$role/$screen', params: { role: ws, screen: defaultScreen } });
  };

  return (
    <div className="relative inline-block">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { setOpen(!open); setAccessDenied(null); }}
        className="flex items-center gap-2 text-xs text-foreground hover:bg-secondary"
        aria-label="Switch workspace"
        aria-expanded={open}
      >
        <WorkspaceIcon role={currentUser.role} className="h-3.5 w-3.5" />
        <span className="hidden sm:inline truncate max-w-[80px]">{currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}</span>
        <ArrowRight className="h-3 w-3" />
      </Button>
      {open && (
        <div className="absolute left-0 mt-2 w-48 rounded-md border border-border bg-card py-2 shadow-xl z-50">
          {workspaces.map(ws => {
            const active = ws === currentUser.role;
            const authorised = canAccessWorkspace(currentUser, ws);
            return (
              <button
                key={ws}
                onClick={() => handleSwitch(ws)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${active ? 'bg-primary/10 text-primary' : !authorised ? 'text-muted-foreground/50 cursor-not-allowed' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                disabled={!authorised && ws !== currentUser.role}
              >
                <WorkspaceIcon role={ws} className="h-4 w-4" />
                <span className={active ? 'font-semibold' : 'font-normal'}>{WORKSPACE_LABELS[ws].label}</span>
                {!authorised && ws !== currentUser.role && <span className="ml-auto text-[10px] text-muted-foreground/50">No access</span>}
                {active && <span className="ml-auto text-[10px] text-primary">Current</span>}
              </button>
            );
          })}
        </div>
      )}
      {accessDenied && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAccessDenied(null)}>
          <div className="rounded-md border border-border bg-card p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">Access denied</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Your account is not authorised to enter the <span className="font-semibold">{WORKSPACE_LABELS[accessDenied].label}</span> workspace.
            </p>
            <Button variant="outline" size="sm" onClick={() => setAccessDenied(null)} className="mt-4">OK</Button>
          </div>
        </div>
      )}
    </div>
  );
}
