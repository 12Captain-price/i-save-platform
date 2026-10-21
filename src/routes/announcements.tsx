import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro, ContentEmpty } from "@/components/site/SiteSections";
export const Route = createFileRoute("/announcements")({
  head: () => ({ meta: [{ title: "Announcements | i-Save" }] }),
  component: Page,
});
function Page() {
  return (
    <PublicLayout>
      <div className="page-container">
        <PageIntro eyebrow="Organisation information" title="Announcements">
          <p>Information from the i-Save office.</p>
        </PageIntro>
        <ContentEmpty title="No approved announcements are published">
          Updates will appear here when approved content is available. For application follow-up or
          account questions, contact the office.
        </ContentEmpty>
      </div>
    </PublicLayout>
  );
}
