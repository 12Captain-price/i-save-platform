import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro, ContentEmpty } from "@/components/site/SiteSections";
export const Route = createFileRoute("/team")({
  head: () => ({ meta: [{ title: "Our team | i-Save" }] }),
  component: Page,
});
function Page() {
  return (
    <PublicLayout>
      <div className="page-container">
        <PageIntro eyebrow="Organisation information" title="Our team">
          <p>Information from the i-Save office.</p>
        </PageIntro>
        <ContentEmpty title="Team information is not published yet">
          Approved staff and leadership profiles are awaiting publication. For help, use the
          organisation contact details rather than sample profiles.
        </ContentEmpty>
      </div>
    </PublicLayout>
  );
}
