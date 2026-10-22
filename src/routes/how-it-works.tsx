import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro, ApplicationSteps } from "@/components/site/SiteSections";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/how-it-works")({
  head: () => ({ meta: [{ title: "How membership works | i-Save" }] }),
  component: HowItWorks,
});
function HowItWorks() {
  return (
    <PublicLayout>
      <div className="page-container">
        <PageIntro eyebrow="How it works" title="Understand each step before you apply.">
          <p>
            Membership review, payment verification and account activation are separate. No online
            payment is required to submit the form.
          </p>
        </PageIntro>
        <h2 className="sr-only">Application steps</h2><ApplicationSteps />
        <section className="mt-8 rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">At the office</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Authorised staff record office payments and verify them separately. Keep your payment
            reference. Registration fees and monthly subscriptions are separate from savings. A fee
            payment does not approve a savings plan.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Savings-category interest is not enrolment. Activated members may apply separately for effective published plans after reading and acknowledging the complete terms. Authorised review and enrolment activation remain separate steps; neither creates a payment.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/register">Apply for membership</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/fees">Fees and payment</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
