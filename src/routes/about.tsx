import {PublishedContent} from '@/components/site/PublishedContent';
﻿import { createFileRoute, Link } from "@tanstack/react-router";
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
        <PublishedContent kind="organisation" emptyTitle="Organisation information is awaiting publication"/>
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
