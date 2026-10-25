import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ContentEmpty } from "./SiteSections";
import { contentSupportApi, harareDate, type PublicContent } from "@/lib/content-support-api";

export function ContentCard({
  item,
  protectedMedia = false,
}: {
  item: PublicContent;
  protectedMedia?: boolean;
}) {
  const f = item.fields;
  const body = (
    <>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
        {f.body}
      </p>
      {item.media && (
        <img
          className="mt-5 max-h-96 w-full rounded-lg object-contain"
          src={
            (protectedMedia ? "/api/content/media/" : "/api/public/content/media/") + item.media.id
          }
          alt={item.media.alt}
        />
      )}
    </>
  );
  if (item.kind === "faq")
    return (
      <details className="rounded-xl border border-border bg-card p-5">
        <summary className="cursor-pointer font-semibold">{f.title}</summary>
        {body}
      </details>
    );
  return (
    <article className="rounded-xl border border-border bg-card p-6">
      <h2 className="break-words text-xl font-semibold">{f.title}</h2>
      {f.team_role && <p className="mt-2 text-primary">{f.team_role}</p>}
      {item.kind === "event" && (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="font-semibold">Event status</dt>
            <dd>{f.event_status}</dd>
          </div>
          {f.starts_at && (
            <div>
              <dt className="font-semibold">Starts</dt>
              <dd>{harareDate(f.starts_at)}</dd>
            </div>
          )}
          {f.ends_at && (
            <div>
              <dt className="font-semibold">Ends</dt>
              <dd>{harareDate(f.ends_at)}</dd>
            </div>
          )}
          <div>
            <dt className="font-semibold">Location</dt>
            <dd>{f.location}</dd>
          </div>
        </dl>
      )}
      {body}
    </article>
  );
}

export function PublishedContent({ kind, emptyTitle }: { kind: string; emptyTitle: string }) {
  const [items, setItems] = useState<PublicContent[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [skip, setSkip] = useState(0),
    [total, setTotal] = useState(0);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const data = await contentSupportApi(
        "/api/public/content?" + new URLSearchParams({ kind, skip: String(skip), limit: "20" }),
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Published information is temporarily unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [kind, skip]);
  return (
    <section className="space-y-4" aria-label="Published information">
      {busy ? (
        <p role="status">Loading approved information…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <Button className="mt-3" onClick={() => void load()}>
            Retry approved information
          </Button>
        </div>
      ) : !items.length ? (
        <ContentEmpty title={emptyTitle}>
          Information will appear here after explicit approval and effective publication. For
          assistance, use the approved office contacts.
        </ContentEmpty>
      ) : (
        <div className={kind === "faq" ? "space-y-3" : "grid gap-5 md:grid-cols-2"}>
          {items.map((item) => (
            <ContentCard key={item.item_id} item={item} />
          ))}
        </div>
      )}
      {total > 20 && (
        <div className="flex gap-3">
          <Button disabled={busy || skip === 0} onClick={() => setSkip(Math.max(0, skip - 20))}>
            Previous
          </Button>
          <Button disabled={busy || skip + 20 >= total} onClick={() => setSkip(skip + 20)}>
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
