import {PublishedContent} from '@/components/site/PublishedContent';
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro } from "@/components/site/SiteSections";
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
        <PublishedContent kind="announcement" emptyTitle="No approved announcements are published"/>
      </div>
    </PublicLayout>
  );
}
