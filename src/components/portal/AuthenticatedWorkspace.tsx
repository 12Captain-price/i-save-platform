import { Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, LogOut, ArrowUpRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/components/auth/AuthProvider";
import { navigation, screenTitle, type Role } from "@/lib/portal/navigation";
import { OrganisationOverview, MembersDirectory } from "./AdminDataScreens";
import { SubscriptionPayments } from "./SubscriptionPayments";
import { FinancialReports } from "./FinancialOperations";
import { OrganisationSettings } from "./OrganisationSettings";
import { PlanDrafts } from "./PlanDrafts";
import { MemberPlans } from './MemberPlans';
import { PlanApplicationReview } from './PlanApplicationReview';
import { SavingsWorkspace } from "./SavingsWorkspace";
import { MemberOverview } from "./MemberOverview";
import { MemberFees } from "./MembershipReview";
import { ApplicationScreens } from "./ApplicationScreens";
import { AssistedRegistration } from "@/components/auth/AssistedRegistration";
const supported: Record<Role, string[]> = {
  member: ["contributions", "dashboard", "fees", "plans", "applications"],
  staff: ["payments", "reports", "contributions", "dashboard", "registrations", "assist-registration", "plan-applications"],
  finance: ["reports", "contributions", "verification", "reconciliation", "ledger", "dashboard", "fees"],
  admin: [
    "reports",
    "contributions",
    "dashboard",
    "registrations",
    "assist-registration",
    "members",
    "plans",
    "plan-applications",
    "finance",
    "settings",
  ],
};
const descriptions: Record<string, string> = {
  applications:'Your recorded plan applications and enrolments, separate from membership registration and category interests.',
  contributions: "Record, verify and reconcile office contributions. Confirmed savings comes only from the ledger.",
  verification: "Review recorded office contributions. Verification alone does not increase confirmed savings.",
  reconciliation: "Match verified payments against evidence and resolve discrepancies before posting savings.",
  ledger: "Inspect confirmed contributions and linked reversals. USD and ZiG remain separate.",
  dashboard: "Your starting point for supported tasks and recorded information.",
  registrations:
    "Search pending applications, inspect payment evidence and review recorded history.",
  members: "Find recorded members and inspect their account links.",
  fees: "View fee obligations and recorded payments. Fees remain separate from savings.",
  finance: "Record and verify subscription payments with separate permissions.",
  payments: "Record subscription payments and review their verification status. Fees remain separate from savings.",
  reports: "Reconcile fees, subscription obligations and savings ledger movements with separate currencies and source records.",
  settings: "Manage versioned drafts and publish changes to future records.",
  plans: "Review plans and exact terms. Drafts require explicit approval and publication before they are offered.",
  'plan-applications':'Review accepted plan terms and activate enrolments with separate permissions.',
  "assist-registration":
    "Confirm details and obtain the applicant’s authorisation before submitting.",
};
function SessionGate() {
  const auth = useAuth();
  if (auth.status === "loading")
    return (
      <div className="page-container" role="status">
        Checking your session…
      </div>
    );
  if (auth.status === "error")
    return (
      <div className="page-container">
        <p role="alert">{auth.notice}</p>
        <Button className="mt-4" onClick={() => void auth.refresh()}>
          Try again
        </Button>
      </div>
    );
  return <Navigate to="/login" replace />;
}
export function WorkspaceEntry() {
  const auth = useAuth();
  if (auth.status !== "ready" || !auth.identity) return <SessionGate />;
  return auth.identity.workspace ? (
    <Navigate
      to="/portal/$role/$screen"
      params={{ role: auth.identity.workspace, screen: "dashboard" }}
      replace
    />
  ) : (
    <Navigate to="/login" replace />
  );
}
function TaskHome({ role }: { role: "staff" | "finance" }) {
  const items =
    role === "staff"
      ? [
          [
            "registrations",
            "Review applications",
            "Search submissions, check details and inspect payment and review status.",
          ],
          [
            "assist-registration",
            "Assist an applicant",
            "Submit confirmed details with the applicant’s explicit authorisation.",
          ],
        ]
      : [
          [
            "fees",
            "Subscription fees",
            "Inspect exact payment options, record receipts and verify payments when authorised.",
          ],
        ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map(([screen, title, text]) => (
        <Link
          key={screen}
          to="/portal/$role/$screen"
          params={{ role, screen: screen! }}
          className="rounded-xl border border-border bg-card p-6 hover:border-primary/50"
        >
          <h2 className="flex items-center gap-3 text-lg font-semibold">
            {title}
            <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            Your backend permissions determine the actions available.
          </p>
        </Link>
      ))}
    </div>
  );
}
export function AuthenticatedWorkspace({ role, screen }: { role: Role; screen: string }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (auth.status !== "ready" || !auth.identity) return <SessionGate />;
  const workspace = auth.identity.workspace;
  if (!workspace) return <Navigate to="/login" replace />;
  if (workspace !== role)
    return (
      <div className="page-container">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="mt-3">Your account is not assigned to this workspace.</p>
        <Button className="mt-5" asChild>
          <Link to="/portal/$role/$screen" params={{ role: workspace, screen: "dashboard" }}>
            Your workspace
          </Link>
        </Button>
      </div>
    );
  const roleName = role === "admin" ? "Admin" : role.charAt(0).toUpperCase() + role.slice(1);
  const all = [...navigation[role]].sort((a, b) =>
    a.id === "dashboard" ? -1 : b.id === "dashboard" ? 1 : 0,
  );
  const links = (available: boolean) =>
    all
      .filter((item) => supported[role].includes(item.id) === available)
      .map((item) => (
        <Link
          key={item.id}
          to="/portal/$role/$screen"
          params={{ role, screen: item.id }}
          onClick={() => setOpen(false)}
          aria-current={screen === item.id ? "page" : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-sm ${screen === item.id ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
        >
          <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          {item.label}
        </Link>
      ));
  const sidebar = (
    <>
      <div className="border-b border-border px-6 py-6">
        <Link to="/" aria-label="i-Save public website">
          <img
            src="/images/isave-logo-dark.png"
            alt="i-Save"
            width={1983}
            height={793}
            className="h-11 w-auto max-w-40 object-contain"
          />
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">
          {roleName} workspace
        </p>
      </div>
      <nav
        aria-label={`${roleName} portal navigation`}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4"
      >
        <div>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {role === "member" ? "Your account" : "Working tasks"}
          </p>
          {links(true)}
          {(role === "admin" || role === "staff") &&
            auth.identity.permissions.includes("applications:assist") && (
              <Link
                to="/portal/$role/$screen"
                params={{ role, screen: "assist-registration" }}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-3 py-3 text-sm text-primary"
                aria-current={screen === "assist-registration" ? "page" : undefined}
              >
                Assisted registration
              </Link>
            )}
        </div>
        <details open={!supported[role].includes(screen)}>
          <summary className="cursor-pointer px-3 py-3 text-xs font-semibold text-muted-foreground">
            More services · unavailable
          </summary>
          <div className="mt-1">{links(false)}</div>
        </details>
      </nav>
      <div className="border-t border-border p-5">
        <Link to="/" className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
          <ArrowUpRight size={17} aria-hidden="true" />
          Public website
        </Link>
        <p className="mt-3 text-xs text-muted-foreground">Office payments only</p>
      </div>
    </>
  );
  return (
    <div className={`portal-theme portal-${role} min-h-screen bg-background text-foreground`}>
      <a href="#portal-main" className="skip-link">
        Skip to workspace content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface-deep lg:flex">
        {sidebar}
      </aside>
      <div className="min-w-0 lg:pl-64">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-border px-5 md:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open portal menu"
                  className="shrink-0 lg:hidden"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                aria-describedby={undefined}
                side="left"
                className="portal-theme flex w-[min(20rem,90vw)] flex-col gap-0 bg-surface-deep p-0"
              >
                <SheetTitle className="sr-only">{roleName} portal menu</SheetTitle>
                {sidebar}
              </SheetContent>
            </Sheet>
            <span className="truncate text-sm text-muted-foreground">
              {roleName} / {screenTitle(role, screen)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="hidden max-w-52 truncate text-xs text-muted-foreground sm:block"
              title={auth.identity.user.email}
            >
              {auth.identity.user.email}
            </span>
            <Button
              variant="outline"
              aria-label="Log out"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await auth.logout();
                } catch {
                  setError(
                    "Could not sign out. Your session may still be active. Please try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </header>
        <main
          id="portal-main"
          tabIndex={-1}
          className="mx-auto max-w-[1400px] px-5 py-7 md:px-10 md:py-10"
        >
          {error && (
            <p role="alert" className="mb-5 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mb-7">
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
              {screenTitle(role, screen)}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {role === "member" && screen === "contributions" ? "View your contribution history, confirmed savings and receipts. Pending contributions are shown separately." : descriptions[screen] ??
                "This service is awaiting implementation. No simulated transactions are shown."}
            </p>
          </div>
          {screen === "reports" && role !== "member" ? <FinancialReports/> : screen === "contributions" || (role === "finance" && ["verification","reconciliation","ledger"].includes(screen)) ? <SavingsWorkspace key={screen} member={role === "member"} initialStatus={screen === "verification" ? "Pending verification" : screen === "reconciliation" ? "Verified" : screen === "ledger" ? "Confirmed" : ""}/> : role === "staff" && screen === "payments" ? <SubscriptionPayments/> : (role === "staff" || role === "finance") && screen === "dashboard" ? (
            <TaskHome role={role} />
          ) : (role === "admin" && screen === "finance") ||
            (role === "finance" && screen === "fees") ? (
            <SubscriptionPayments />
          ) : role === "admin" && screen === "settings" ? (
            <OrganisationSettings />
          ) : (role==='admin'||role==='staff')&&screen==='plan-applications' ? (
            <PlanApplicationReview/>
          ) : role==='member'&&['plans','applications'].includes(screen) ? (
            <MemberPlans applicationsOnly={screen==='applications'}/>
          ) : role === "admin" && screen === "plans" ? (
            <PlanDrafts />
          ) : role === "member" && screen === "dashboard" ? (
            <MemberOverview />
          ) : role === "member" && screen === "fees" ? (
            <MemberFees />
          ) : (role === "admin" || role === "staff") && screen === "assist-registration" ? (
            <AssistedRegistration />
          ) : (role === "admin" || role === "staff") && screen === "registrations" ? (
            <ApplicationScreens />
          ) : role === "admin" && screen === "dashboard" ? (
            <OrganisationOverview />
          ) : role === "admin" && screen === "members" ? (
            <MembersDirectory />
          ) : (
            <section className="rounded-xl border border-border bg-card p-6 sm:p-8" role="status">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unavailable
              </p>
              <h2 className="text-xl font-semibold">This screen is not available yet</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                You are signed in. This part of your workspace is not connected yet. Please contact
                the office for assistance.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="outline" asChild>
                  <Link to="/portal/$role/$screen" params={{ role, screen: "dashboard" }}>
                    Back to overview
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/contact">Contact the office</Link>
                </Button>
              </div>
            </section>
          )}
        </main>
        <footer className="px-5 pb-8 text-xs text-muted-foreground md:px-10">
          i-Save · Fees and subscriptions are separate from savings.
        </footer>
      </div>
    </div>
  );
}
