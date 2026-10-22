import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro } from "@/components/site/SiteSections";
import { savingsInterest } from "@/lib/savings-interest";
import { Button } from "@/components/ui/button";
import { PlanOffers } from '@/components/portal/MemberPlans';
export const Route = createFileRoute("/plans/$slug")({ component: Details });
function Details() {
  const { slug } = Route.useParams();
  const category = savingsInterest.categories.find((c) => c.id + "-savings" === slug);
  if (!category) throw notFound();
  return (
    <PublicLayout>
      <div className="page-container max-w-4xl">
        <Link
          to="/plans"
          className="mb-6 inline-flex text-sm text-primary underline underline-offset-4"
        >
          ← All savings categories
        </Link>
        <PageIntro
          eyebrow="Savings category · Expression of interest"
          title={category.label + " savings"}
        >
          <p>{category.purpose}</p>
        </PageIntro>
        <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Plan terms awaiting confirmation</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {savingsInterest.rules}
          </p>
          <h2 className="mt-6 text-lg font-semibold">Your next step</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            If you are applying for membership, choose this category on the application form to
            record your preference. It is not a formal plan application. Existing applicants should
            contact the office rather than register again.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/register">Apply for membership</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/contact">Ask about this category</Link>
            </Button>
          </div>
        </section>
        <div className="mt-8"><PlanOffers category={category.id}/></div>
      </div>
    </PublicLayout>
  );
}
