import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro } from "@/components/site/SiteSections";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/fees")({
  head: () => ({ meta: [{ title: "Fees and office payments | i-Save" }] }),
  component: Fees,
});
function Fees() {
  return (
    <PublicLayout>
      <div className="page-container max-w-5xl">
        <PageIntro eyebrow="Fees and office payments" title="Understand what you are paying for.">
          <p>
            Registration fees and monthly subscriptions are separate from savings. No payment is
            taken through this website.
          </p>
        </PageIntro>
        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">Registration fee</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A registration-fee payment must be recorded and verified before authorised staff can
              approve membership. Submitting an application or ticking a review checkbox does not
              confirm payment.
            </p>
          </section>
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">Monthly subscription</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Subscriptions begin in the calendar month following activation. Check your recorded
              obligation for its amount and any configured due date. No overdue or penalty rules are
              enabled.
            </p>
          </section>
        </div>
        <section className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-6">
          <h2 className="text-xl font-semibold">Check the exact amount before paying</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The public site does not currently publish a live fee schedule. Contact the office for
            current published amounts. After activation, your Fees page shows your own recorded
            obligations and payments.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Where an effective published rate was captured for a USD fee obligation, authorised
            staff can show its exact USD or ZiG full-payment options before payment. Existing
            obligations retain their captured amounts and rates. No savings conversion is available.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/contact">Confirm fees with the office</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/login">Log in to view your fees</Link>
            </Button>
          </div>
        </section>
        <p className="mt-6 text-sm text-muted-foreground">
          Keep your office payment reference. Refund policy remains unconfigured; ask the office
          about unresolved questions before paying.{" "}
          <Link to="/disclosures" className="text-primary underline">
            Read disclosures
          </Link>
          .
        </p>
      </div>
    </PublicLayout>
  );
}
