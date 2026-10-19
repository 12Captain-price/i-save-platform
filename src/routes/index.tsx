import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Building2, Plane, ShieldAlert, Briefcase, GraduationCap,
  UserPlus, ListChecks, Landmark, Receipt, History, Eye, Mail,
} from "lucide-react";
import { SiteHeader, NAV } from "@/components/site/SiteHeader";
import { HeroVisual } from "@/components/site/HeroVisual";
import { Logo } from "@/components/site/Logo";
const zpyfLogo = '/images/zpyf-logo.png';
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "iSave — Your future, built one saving at a time" },
      { name: "description", content: "iSave helps members build savings, track recorded contributions and plan for what matters." },
      { property: "og:title", content: "iSave — Structured savings, clearly recorded" },
      { property: "og:description", content: "A clearer way to build your savings, track your progress and plan for what matters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const PLANS = [
  { icon: Building2, name: "Asset Savings", text: "Save steadily toward a significant purchase." },
  { icon: Plane, name: "Holiday Savings", text: "Put money aside for time away and travel." },
  { icon: ShieldAlert, name: "Emergency Savings", text: "Build a reserve for the unexpected." },
  { icon: Briefcase, name: "Retrenchment Savings", text: "Prepare a cushion for changes in employment." },
  { icon: GraduationCap, name: "Education Savings", text: "Plan ahead for school and study costs." },
];

const GOALS = [
  { icon: Building2, name: "Asset Savings", span: "sm:col-span-1 lg:col-span-3", text: "Turn a purchase you can already picture into a steady, manageable habit." },
  { icon: Plane, name: "Holiday Savings", span: "sm:col-span-1 lg:col-span-3", text: "Set money aside now so time away feels like a break, not a squeeze." },
  { icon: ShieldAlert, name: "Emergency Savings", span: "sm:col-span-1 lg:col-span-2", text: "Give yourself room to breathe when something unexpected comes up." },
  { icon: Briefcase, name: "Retrenchment Savings", span: "sm:col-span-1 lg:col-span-2", text: "Keep your footing steady while you look for what comes next." },
  { icon: GraduationCap, name: "Education Savings", span: "sm:col-span-2 lg:col-span-2", text: "Start early, so school and study costs arrive as a plan and not a surprise." },
];

const STEPS = [
  { icon: UserPlus, title: "Create your member account", text: "Register as a member of the savings organisation." },
  { icon: ListChecks, title: "Choose a savings plan", text: "Select the category that matches your goal." },
  { icon: Landmark, title: "Contribute & track online", text: "Make contributions at the organisation's office. Authorised staff record each payment, and you follow your recorded savings online." },
];

function Eyebrow({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary ${className ?? ""}`} style={style}>{children}</p>;
}

function Index() {
  return (
    <div id="top" className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-16 px-6 pb-24 pt-16 lg:grid-cols-[1.15fr_1fr] lg:pt-24">
          <div>
            <Eyebrow className="animate-rise" style={{ animationDelay: "0s" }}>Savings, structured</Eyebrow>
            <h1 className="animate-rise text-5xl font-extrabold leading-[1.02] sm:text-6xl xl:text-7xl" style={{ animationDelay: "0.12s" }}>
              Your future, built <span className="text-primary">one saving</span> at a time.
            </h1>
            <p className="animate-rise mt-6 max-w-lg text-lg text-muted-foreground" style={{ animationDelay: "0.24s" }}>
              A clearer way to build your savings, track your progress and plan for what matters.
            </p>
            <div className="animate-rise mt-10 flex flex-col gap-4 sm:flex-row" style={{ animationDelay: "0.36s" }}>
              <a href="#plans" className="group inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-6 py-4 font-bold text-primary-foreground transition-transform hover:-translate-y-0.5">
                Explore Savings Plans <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#how-it-works" className="inline-flex items-center justify-center rounded-sm border border-border px-6 py-4 font-semibold transition-colors hover:border-foreground">
                How iSave Works
              </a>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end"><HeroVisual /></div>
        </section>

        {/* Goals */}
        <section id="goals" className="mx-auto max-w-7xl scroll-mt-20 px-6 pb-24">
          <div className="mb-14 grid gap-6 lg:grid-cols-2 lg:items-end">
            <div>
              <Eyebrow>Savings goals</Eyebrow>
              <h2 className="text-4xl font-bold sm:text-5xl">What are you saving for?</h2>
            </div>
            <p className="max-w-sm text-muted-foreground lg:justify-self-end">
              Every saving starts with a reason. Pick the goal that sounds most like yours, then explore the plan that fits it.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {GOALS.map((g) => (
              <li key={g.name} className={g.span}>
                <a
                  href="#plans"
                  aria-label={`${g.name} — explore the savings plan`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-sm border border-border bg-surface-deep p-7 transition-colors duration-300 hover:border-primary/50 hover:bg-secondary focus-visible:border-primary/50 focus-visible:bg-secondary"
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-primary transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100"
                  />
                  <g.icon className="h-7 w-7 text-primary transition-transform duration-300 group-hover:-translate-y-1 group-focus-visible:-translate-y-1" strokeWidth={1.5} />
                  <h3 className="mt-8 text-lg font-semibold">{g.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{g.text}</p>
                  <span className="mt-auto inline-flex items-center gap-2 pt-8 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary">
                    See plan <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* Plans */}
        <section id="plans" className="scroll-mt-20 border-t border-border bg-surface-deep">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="mb-14 grid gap-6 lg:grid-cols-2 lg:items-end">
              <div>
                <Eyebrow>Savings plans</Eyebrow>
                <h2 className="text-4xl font-bold sm:text-5xl">Five ways to save with purpose.</h2>
              </div>
              <p className="text-muted-foreground lg:justify-self-end lg:max-w-sm">
                Plan details, contribution terms and eligibility are provided by the organisation.
              </p>
            </div>
            <ul className="grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-5">
              {PLANS.map((p, i) => (
                <li key={p.name} className="group border-b border-r border-border p-8 transition-colors hover:bg-secondary">
                  <span className="font-display text-sm text-muted-foreground">0{i + 1}</span>
                  <p.icon className="mt-10 h-7 w-7 text-primary transition-transform group-hover:-translate-y-1" strokeWidth={1.5} />
                  <h3 className="mt-6 text-lg font-semibold">{p.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-24">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="max-w-2xl text-4xl font-bold sm:text-5xl">Three steps from intention to progress.</h2>
          <ol className="mt-16 grid gap-12 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative border-t-2 border-border pt-8 first:border-primary">
                <span className="font-display text-6xl font-extrabold text-secondary">{i + 1}</span>
                <s.icon className="absolute right-0 top-8 h-6 w-6 text-primary" strokeWidth={1.5} />
                <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-3 text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
          <p id="fees" className="mt-14 scroll-mt-24 border-l-2 border-primary pl-5 text-sm text-muted-foreground">
            iSave does not take payments online. All contributions are made in person and recorded by authorised staff.
            Fee information will be published by the organisation.
          </p>
        </section>

        {/* Trust */}
        <section className="border-y border-border bg-surface-deep">
          <div className="mx-auto grid max-w-7xl gap-16 px-6 py-24 lg:grid-cols-2">
            <div>
              <Eyebrow>Transparency</Eyebrow>
              <h2 className="text-4xl font-bold sm:text-5xl">See every recorded contribution.</h2>
              <p className="mt-6 max-w-md text-muted-foreground">
                Once your payments are recorded by staff, you can review them in one place — so you always know where your savings stand.
              </p>
            </div>
            <ul className="divide-y divide-border">
              {[
                { icon: Eye, t: "Recorded savings", d: "View the balance of savings recorded against your plans." },
                { icon: History, t: "Contribution history", d: "A dated record of every contribution captured by staff." },
                { icon: Receipt, t: "Receipts", d: "Access receipts for contributions that have been recorded." },
              ].map((x) => (
                <li key={x.t} className="flex gap-5 py-6 first:pt-0">
                  <x.icon className="mt-1 h-6 w-6 shrink-0 text-primary" strokeWidth={1.5} />
                  <div>
                    <h3 className="text-lg font-semibold">{x.t}</h3>
                    <p className="mt-1 text-muted-foreground">{x.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section id="join" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-28 text-center">
          <h2 className="mx-auto max-w-3xl text-4xl font-extrabold sm:text-6xl">
            Start building what <span className="text-primary">matters</span>.
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-muted-foreground">
            Log in to your member account or register to start saving with i-Save.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Link to="/plans" className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-6 py-4 font-bold text-primary-foreground transition-transform hover:-translate-y-0.5">
              Explore Savings Plans <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center rounded-sm border border-border px-6 py-4 font-semibold hover:border-foreground">
              Contact us
            </Link>
          </div>
        </section>
      </main>

      <footer id="contact" className="border-t border-border bg-surface-deep">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">Structured savings for members of a Zimbabwean savings organisation.</p>
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" /><Link to="/contact" className="text-primary hover:underline">Contact the team</Link>
            </p>
          </div>
          <nav aria-label="Footer">
            <h3 className="mb-4 text-sm font-semibold">Explore</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {NAV.map((n) => (
                <li key={n.href}><Link to={n.href} className="hover:text-foreground">{n.label}</Link></li>
              ))}
            </ul>
          </nav>
          <div>
            <h3 className="mb-4 text-sm font-semibold">Information</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {["FAQs", "Terms", "Privacy"].map((l) => (
                <li key={l}><Link to={`/${l.toLowerCase()}` as any}>{l}</Link></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-border py-6">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 px-6 text-xs text-muted-foreground sm:flex-row sm:gap-4">
            <span>© {new Date().getFullYear()} iSave</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span className="flex items-center gap-2">
              An initiative of
              <img
                src={zpyfLogo}
                alt="Zimbabwe Progressive Youth Foundation"
                width={1536}
                height={1024}
                className="h-7 w-auto rounded-sm bg-white/95 px-1 py-0.5"
              />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
