import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro } from "@/components/site/SiteSections";
export const Route = createFileRoute("/eligibility")({
  head: () => ({ meta: [{ title: "Membership requirements | i-Save" }] }),
  component: Eligibility,
});
function Eligibility() {
  return (
    <PublicLayout>
      <div className="page-container max-w-3xl">
        <PageIntro eyebrow="Before applying" title="Check membership requirements with the office.">
          <p>Submitting an application does not establish eligibility or approve membership.</p>
        </PageIntro>
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">Requirements awaiting confirmation</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            No additional identity-document or eligibility checklist is configured on this website.
            Do not send identity documents, passwords or payment information in the application
            form. Ask the office about the requirements that apply to you.
          </p>
          <Link
            to="/contact"
            className="mt-5 inline-flex text-primary underline underline-offset-4"
          >
            Contact the office
          </Link>
        </section>
      </div>
    </PublicLayout>
  );
}
