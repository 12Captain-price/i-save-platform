import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro, ContentEmpty } from "@/components/site/SiteSections";
export const Route = createFileRoute("/events")({
  head: () => ({ meta: [{ title: "Events | i-Save" }] }),
  component: Page,
});
function Page() {
  return (
    <PublicLayout>
      <div className="page-container">
        <PageIntro eyebrow="Organisation information" title="Events">
          <p>Information from the i-Save office.</p>
        </PageIntro>
        <ContentEmpty title="No approved events are published">
          There are no confirmed event listings on this site. Contact the office if you need
          information about an event.
        </ContentEmpty>
      </div>
    </PublicLayout>
  );
}
