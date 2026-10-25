import {PublishedContent} from '@/components/site/PublishedContent';
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro } from "@/components/site/SiteSections";
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
        <PublishedContent kind="event" emptyTitle="No approved events are published"/>
      </div>
    </PublicLayout>
  );
}
