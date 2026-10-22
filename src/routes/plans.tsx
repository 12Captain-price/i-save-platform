import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro, CategoryCards } from "@/components/site/SiteSections";
import { PlanOffers } from '@/components/portal/MemberPlans';
export const Route = createFileRoute("/plans")({
  head: () => ({ meta: [{ title: "Savings categories | i-Save" }] }),
  component: PlansRoute,
});
function PlansRoute() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return pathname.replace(/\/$/, "") === "/plans" ? <Plans /> : <Outlet />;
}
function Plans() {
  return (
    <PublicLayout>
      <div className="page-container">
        <PageIntro eyebrow="Savings goals" title="Explore a category that matters to you.">
          <p>
            Record a preferred category with your membership application. Category interest is separate from a plan application; effective published plans are listed below when available.
          </p>
        </PageIntro>
        <h2 className="sr-only">Savings categories</h2><CategoryCards />
        <div className="mt-8"><PlanOffers/></div>
        <p className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-5 text-sm leading-relaxed text-muted-foreground">
          Category preferences do not accept terms or activate enrolment. Only the complete terms of an explicitly published plan can be acknowledged in a separate plan application.{" "}
          <Link to="/contact" className="text-primary underline">
            Ask the office for guidance
          </Link>
          .
        </p>
      </div>
    </PublicLayout>
  );
}
