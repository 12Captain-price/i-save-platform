import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro, CategoryCards } from "@/components/site/SiteSections";
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
            You can record a preferred savings category with your membership application. No
            published savings plans are available for enrolment yet.
          </p>
        </PageIntro>
        <h2 className="sr-only">Savings categories</h2><CategoryCards />
        <p className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-5 text-sm leading-relaxed text-muted-foreground">
          Contribution amounts, currencies, schedules, duration, fees and detailed rules are
          awaiting approval. No plan terms are available to accept.{" "}
          <Link to="/contact" className="text-primary underline">
            Ask the office for guidance
          </Link>
          .
        </p>
      </div>
    </PublicLayout>
  );
}
