import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro } from "@/components/site/SiteSections";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About i-Save | i-Save" }] }),
  component: About,
});
function About() {
  return (
    <PublicLayout>
      <div className="page-container max-w-5xl">
        <PageIntro eyebrow="About i-Save" title="A clearer place to manage membership.">
          <p>
            i-Save is an initiative of the Zimbabwe Progressive Youth Foundation. The website
            supports membership applications and authenticated access to recorded membership and fee
            information.
          </p>
        </PageIntro>
        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">Office support, online access</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Authorised staff review applications and record office payments. Members can check
              their own membership status, fee records, subscriptions and category interests after
              activation.
            </p>
          </section>
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">Know what is available</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Savings-plan enrolment, reliable savings summaries and several account services are
              not connected yet. The site labels unavailable functionality rather than displaying
              example balances or promising returns.
            </p>
          </section>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/how-it-works">Understand the process</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/contact">Contact the organisation</Link>
          </Button>
        </div>
      </div>
    </PublicLayout>
  );
}
