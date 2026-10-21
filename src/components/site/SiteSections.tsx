import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Plane, ShieldAlert, Briefcase, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savingsInterest } from "@/lib/savings-interest";

export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <header className="mb-8 max-w-3xl sm:mb-10">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h1 className="text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">{title}</h1>
      <div className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
        {children}
      </div>
    </header>
  );
}
export function ContentEmpty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Awaiting approved content
      </p>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>
      <Button asChild variant="outline" className="mt-5">
        <Link to="/contact">
          Contact the office
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
const icons = [Building2, Plane, ShieldAlert, Briefcase, GraduationCap];
export function CategoryCards() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {savingsInterest.categories.map((category, index) => {
        const Icon = icons[index]!;
        return (
          <li key={category.id}>
            <Link
              to="/plans/$slug"
              params={{ slug: category.id + "-savings" }}
              className="group flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/60"
            >
              <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">{category.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {category.purpose}
              </p>
              <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-primary">
                Explore this category
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
export function ApplicationSteps() {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {[
        [
          "Apply for membership",
          "Provide your details and, if you wish, a savings-category preference. Your application is saved as Pending.",
        ],
        [
          "Complete the office review",
          "Authorised staff review your application. Registration-fee payment, verification and membership approval are separate steps.",
        ],
        [
          "Set up your account after activation",
          "Follow the account-setup instructions supplied by authorised staff when available. Applying does not create a login.",
        ],
      ].map(([title, text], index) => (
        <li key={title} className="rounded-xl border border-border bg-card p-6">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 text-sm font-semibold text-primary"
            aria-label={"Step " + (index + 1)}
          >
            {index + 1}
          </span>
          <h3 className="mt-4 font-semibold">{title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
        </li>
      ))}
    </ol>
  );
}
