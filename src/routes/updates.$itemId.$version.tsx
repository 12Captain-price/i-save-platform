import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { ContentCard } from "@/components/site/PublishedContent";
import { Button } from "@/components/ui/button";
import { contentSupportApi, type PublicContent } from "@/lib/content-support-api";
export const Route = createFileRoute("/updates/$itemId/$version")({ component: Page });
function Page() {
  const { itemId, version } = Route.useParams();
  const [item, setItem] = useState<PublicContent | null>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      if (!/^[1-9][0-9]{0,9}$/.test(itemId) || !/^[1-9][0-9]{0,9}$/.test(version))
        throw Error("This published version is unavailable.");
      setItem(await contentSupportApi("/api/public/content/" + itemId + "/" + version));
    } catch {
      setError("This published version is unavailable. It may have been replaced or archived.");
    }
  }
  useEffect(() => {
    setItem(null);
    void load();
  }, [itemId, version]);
  return (
    <PublicLayout>
      <section className="page-container max-w-4xl" aria-label="Published content version">
        {error ? (
          <div role="alert">
            <h1 className="mb-3 text-2xl font-semibold">Published version unavailable</h1>
            <p>{error}</p>
            <Button onClick={() => void load()}>Retry published information</Button>
          </div>
        ) : item ? (
          <>
            <p className="mb-4 text-sm text-primary">
              Published {item.kind} · Version {item.version}
            </p>
            <ContentCard item={item} headingLevel="h1" />
          </>
        ) : (
          <p role="status">Loading published information…</p>
        )}
      </section>
    </PublicLayout>
  );
}
