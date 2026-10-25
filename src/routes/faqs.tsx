import {PublishedContent} from '@/components/site/PublishedContent';
﻿import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro } from "@/components/site/SiteSections";
export const Route = createFileRoute("/faqs")({
  head: () => ({ meta: [{ title: "Frequently asked questions | i-Save" }] }),
  component: FAQs,
});
function FAQs() {
  return (
    <PublicLayout>
      <div className="page-container max-w-3xl">
        <PageIntro eyebrow="Help and guidance" title="Frequently asked questions">
          <p>Understand applications, payments and account access before you begin.</p>
        </PageIntro>
        <PublishedContent kind="faq" emptyTitle="No approved FAQs are published yet"/>
        <p className="mt-6 text-sm text-muted-foreground">
          Still need help?{" "}
          <Link to="/contact" className="text-primary underline underline-offset-4">
            Contact the office
          </Link>
          .
        </p>
      </div>
    </PublicLayout>
  );
}
