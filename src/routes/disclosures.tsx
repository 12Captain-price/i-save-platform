import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";

export const Route = createFileRoute("/disclosures")({
  head: () => ({
    meta: [
      { title: "Disclosures — i-Save prototype and financial notices" },
      {
        name: "description",
        content:
          "Important disclosures about the i-Save demonstration prototype and financial information.",
      },
    ],
  }),
  component: Disclosures,
});

function Disclosures() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Important disclosures
          </p>
          <h1 className="text-4xl font-bold sm:text-5xl">Financial and application disclosures</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Read current application guidance and the retained legal drafts.
          </p>
        </div>

        <section className="mb-6 rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">Current application guidance</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Applications are persisted as pending records and account access requires
            authentication. No payment is accepted online. Savings-plan enrolment and a reliable
            savings balance are not available yet. No returns, bonuses or growth are promised.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The earlier disclosures below are retained as draft evidence for management and legal
            review. Their prototype-only and provisional-fee statements are outdated; they do not
            describe the working application. See{" "}
            <a href="/fees" className="text-primary underline">
              current fee guidance
            </a>{" "}
            and contact the office for official information.
          </p>
        </section>
        <details className="rounded-xl border border-border p-5">
          <summary className="cursor-pointer font-semibold">
            Earlier draft disclosures (retained for review)
          </summary>
          <div className="mt-5 space-y-6">
            <div className="rounded-md border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
                Demonstration prototype
              </h3>
              <p className="text-sm text-muted-foreground">
                This website and the connected member, staff and finance portals are a frontend
                demonstration prototype. All names, amounts, dates, records and transactions shown
                are sample data. No real accounts are created and no real financial transactions are
                processed.
              </p>
            </div>

            <div className="rounded-md border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
                No real payments
              </h3>
              <p className="text-sm text-muted-foreground">
                i-Save does not accept payments online. All contributions are made in person at the
                organisation’s office and recorded by authorised staff. No payment gateway is
                connected to this website.
              </p>
            </div>

            <div className="rounded-md border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
                Provisional fees
              </h3>
              <p className="text-sm text-muted-foreground">
                The $20 one-time registration fee and $5 monthly subscription fee shown are
                unconfirmed configuration values used for demonstration only. They are not approved
                organisation policy.
              </p>
            </div>

            <div className="rounded-md border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
                No guaranteed returns
              </h3>
              <p className="text-sm text-muted-foreground">
                i-Save does not offer interest, investment returns, bonuses or guaranteed savings
                growth. Savings balances reflect only recorded contributions.
              </p>
            </div>

            <div className="rounded-md border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
                No real authentication
              </h3>
              <p className="text-sm text-muted-foreground">
                Login, registration and account features in this demonstration do not use real
                authentication. Data entered is held only for the current browser session and is not
                stored permanently.
              </p>
            </div>

            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-6">
              <h3 className="text-sm font-semibold text-destructive uppercase mb-3">
                Not financial advice
              </h3>
              <p className="text-sm text-muted-foreground">
                Nothing on this website constitutes financial advice. Contact the organisation for
                official information about membership, plans and contributions.
              </p>
            </div>
          </div>
        </details>
      </div>
    </PublicLayout>
  );
}
