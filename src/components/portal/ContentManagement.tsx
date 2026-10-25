import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/site/PublishedContent";
import {
  contentSupportApi as api,
  officeInstant,
  harareDate,
  type PublicContent,
} from "@/lib/content-support-api";
type Fields = PublicContent["fields"];
type Version = PublicContent & {
  id: number;
  latest_version: number;
  state: string;
  base_event: number;
  missing: string[];
  author: string;
  recorded_at: string;
  history: {
    id: number;
    state: string;
    reason: string;
    actor: string;
    recorded_at: string;
    effective_at: string | null;
  }[];
};
const empty: Fields = {
  title: "",
  body: "",
  team_role: "",
  location: "",
  event_status: "",
  starts_at: null,
  ends_at: null,
  media_id: null,
};
const kinds = ["organisation", "faq", "team", "event", "announcement"];
const field = "mt-2 w-full rounded-md border border-border bg-background p-3";
const local = (v: string | null) =>
  v ? new Date(new Date(v).getTime() + 7200000).toISOString().slice(0, 16) : "";
export function ContentManagement() {
  const caps = useAuth().identity?.permissions ?? [];
  const [items, setItems] = useState<Version[]>([]),
    [current, setCurrent] = useState<Version | null>(null),
    [versions, setVersions] = useState<Version[]>([]),
    [kind, setKind] = useState("announcement"),
    [fields, setFields] = useState<Fields>({ ...empty }),
    [filter, setFilter] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [skip, setSkip] = useState(0),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [scanning, setScanning] = useState(false);
  const [reason, setReason] = useState(""),
    [effective, setEffective] = useState(""),
    [saveKey, setSaveKey] = useState(crypto.randomUUID()),
    [decisionKey, setDecisionKey] = useState(crypto.randomUUID()),
    [selectedAction, setSelectedAction] = useState(""),
    [alt, setAlt] = useState(""),
    [rights, setRights] = useState(false),
    [rightsNote, setRightsNote] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await api(
        "/api/content?" +
          new URLSearchParams({
            ...(filter ? { kind: filter } : {}),
            q: search,
            skip: String(skip),
            limit: "20",
          }),
      );
      setItems(r.items);
      setTotal(r.total);
      setScanning(r.scanning_available);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [filter, search, skip]);
  function choose(v: Version | null) {
    setCurrent(v);
    setKind(v?.kind ?? "announcement");
    setFields(v ? { ...v.fields } : { ...empty });
    setSaveKey(crypto.randomUUID());
    setDecisionKey(crypto.randomUUID());
    setSelectedAction("");
    setReason("");
    setEffective("");
    setVersions([]);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/content", {
        item_id: current?.item_id ?? null,
        base_version: current?.latest_version ?? 0,
        kind,
        fields,
        request_key: saveKey,
      });
      choose(r);
      setNotice("Private draft saved. The public version has not changed.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/content/versions/" + current.id + "/decision", {
        action: selectedAction,
        base_event: current.base_event,
        reason,
        effective_at: selectedAction === "publish" ? officeInstant(effective) : null,
        request_key: decisionKey,
      });
      choose(r);
      setNotice("Review action saved. Only effective published versions are public.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 2 * 1024 * 1024) throw Error("Choose a PNG or JPEG no larger than 2 MiB.");
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = () => reject(Error("Could not read the image."));
        r.readAsDataURL(file);
      });
      const m = await api("/api/content/media", {
        filename: file.name,
        content_type: file.type,
        data,
        alt,
        rights_confirmed: rights,
        rights_note: rightsNote,
        request_key: crypto.randomUUID(),
      });
      setFields((f) => ({ ...f, media_id: m.id }));
      setNotice("Separately scanned public image stored. Save a draft to attach it.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const actions = current
    ? [
        ...(caps.includes("content:draft") && ["Draft", "Changes requested"].includes(current.state)
          ? ["submit"]
          : []),
        ...(caps.includes("content:review") && current.state === "In review"
          ? ["request_changes", "approve"]
          : []),
        ...(caps.includes("content:publish") && current.state === "Approved" ? ["publish"] : []),
        ...(caps.includes("content:archive") && current.state !== "Archived" ? ["archive"] : []),
      ]
    : [];
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Drafts stay private through review and approval. Publication requires an explicit effective
        time. Contacts are managed in Organisation settings. Legal wording requires authorised legal
        review; this editor provides no legal assurances. No promotional messages are sent to
        members.
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <p className="mt-2 text-sm">
            Your entries are preserved. Retry the unchanged request if the response was lost. For
            conflicts, refresh and review the latest version.
          </p>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Loading content…</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSkip(0);
          setSearch(query);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex-1">
          Search content
          <input
            className={field}
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Content type
          <select
            className={field}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSkip(0);
            }}
          >
            <option value="">All types</option>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <Button disabled={busy}>Search</Button>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh queue
        </Button>
      </form>
      {!busy && !items.length && <p>No content matches this page.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((v) => (
          <button
            key={v.id}
            className="rounded-xl border border-border bg-card p-5 text-left hover:border-primary"
            onClick={() => choose(v)}
          >
            <span className="text-sm text-primary">
              {v.kind} · Version {v.version} ·{" "}
              {v.state === "Published" ? "Published / scheduled" : v.state}
            </span>
            <h2 className="mt-2 break-words font-semibold">
              {v.fields.title || "Untitled private draft"}
            </h2>
            <p className="mt-2 text-sm">{v.missing.length} missing decisions</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy || skip === 0}
          variant="outline"
          onClick={() => setSkip(Math.max(0, skip - 20))}
        >
          Previous
        </Button>
        <span>
          {total} items · Page {skip / 20 + 1}
        </span>
        <Button
          disabled={busy || skip + 20 >= total}
          variant="outline"
          onClick={() => setSkip(skip + 20)}
        >
          Next
        </Button>
        {caps.includes("content:draft") && (
          <Button onClick={() => choose(null)}>New private draft</Button>
        )}
      </div>
      <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
        <h2 className="text-xl font-semibold">
          {current ? "Version " + current.version + " · " + current.state : "New private draft"}
        </h2>
        {current && (
          <>
            <p className="mt-2 text-sm">
              Saved by {current.author} · {harareDate(current.recorded_at)}
            </p>
            <ul className="mt-3 list-inside list-disc text-sm">
              {current.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="my-4"
              onClick={async () => {
                try {
                  setVersions((await api("/api/content/" + current.item_id + "/history")).items);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Load immutable version history
            </Button>
            <div className="flex flex-wrap gap-3">
              {versions.map((v) => (
                <Button
                  variant="outline"
                  key={v.id}
                  onClick={() => {
                    choose(v);
                    setVersions(versions);
                  }}
                >
                  View version {v.version} · {v.state}
                </Button>
              ))}
            </div>
            <details className="my-4">
              <summary>Review and publication history</summary>
              {current.history.map((h) => (
                <p className="mt-3 text-sm" key={h.id}>
                  {h.state} · {h.actor} · {harareDate(h.recorded_at)} · {h.reason}
                  {h.effective_at ? " · Effective " + harareDate(h.effective_at) : ""}
                </p>
              ))}
            </details>
            <h3 className="mb-3 font-semibold">Protected saved-version preview</h3>
            <ContentCard item={current} protectedMedia />
          </>
        )}
        {caps.includes("content:draft") && (
          <form onSubmit={save} className="mt-6 space-y-4">
            <p className="text-sm">
              Saving creates a new private version. It never edits a saved version or replaces
              public information.
            </p>
            <label className="block">
              Type
              <select
                disabled={!!current}
                className={field}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {kinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="block">
              {kind === "faq" ? "Question" : "Title"}
              <input
                className={field}
                maxLength={200}
                value={fields.title}
                onChange={(e) => setFields({ ...fields, title: e.target.value })}
              />
            </label>
            <label className="block">
              {kind === "faq" ? "Answer" : "Public text — plain text only"}
              <textarea
                className={field}
                rows={7}
                maxLength={12000}
                value={fields.body}
                onChange={(e) => setFields({ ...fields, body: e.target.value })}
              />
            </label>
            {kind === "team" && (
              <label className="block">
                Team role
                <input
                  className={field}
                  maxLength={150}
                  value={fields.team_role}
                  onChange={(e) => setFields({ ...fields, team_role: e.target.value })}
                />
              </label>
            )}
            {kind === "event" && (
              <>
                <label className="block">
                  Location
                  <input
                    className={field}
                    maxLength={300}
                    value={fields.location}
                    onChange={(e) => setFields({ ...fields, location: e.target.value })}
                  />
                </label>
                <label className="block">
                  Event status
                  <select
                    className={field}
                    value={fields.event_status}
                    onChange={(e) => setFields({ ...fields, event_status: e.target.value })}
                  >
                    <option value="">Decision unset</option>
                    {["Scheduled", "Cancelled", "Completed"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {(["starts_at", "ends_at"] as const).map((k) => (
                  <label className="block" key={k}>
                    {k === "starts_at" ? "Start" : "Optional end"} — Harare (UTC+02:00)
                    <input
                      className={field}
                      type="datetime-local"
                      value={local(fields[k])}
                      onChange={(e) => {
                        try {
                          setFields({
                            ...fields,
                            [k]: e.target.value ? officeInstant(e.target.value) : null,
                          });
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      }}
                    />
                  </label>
                ))}
              </>
            )}
            <fieldset className="space-y-3 rounded-lg border border-border p-4">
              <legend>Optional public image — separate from private evidence</legend>
              <p className="text-sm">
                PNG or JPEG, up to 2 MiB. Metadata is removed. Public uploads require a working
                scanner.
              </p>
              {!scanning && (
                <p role="status">
                  Image uploads unavailable: scanning is not configured or available.
                </p>
              )}
              <label className="block">
                Image alternative text
                <input
                  className={field}
                  maxLength={300}
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                />
              </label>
              <label className="block">
                Rights and consent evidence
                <input
                  className={field}
                  maxLength={500}
                  value={rightsNote}
                  onChange={(e) => setRightsNote(e.target.value)}
                />
              </label>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={rights}
                  onChange={(e) => setRights(e.target.checked)}
                />
                I confirm the organisation has permission to publish this image.
              </label>
              <label className="block">
                Upload public image
                <input
                  className={field}
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={busy || !scanning || !rights || !alt.trim() || !rightsNote.trim()}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                />
              </label>
              {fields.media_id && (
                <p>
                  Attached public asset {fields.media_id}.{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => setFields({ ...fields, media_id: null })}
                  >
                    Remove from new draft
                  </button>
                </p>
              )}
            </fieldset>
            <Button disabled={busy}>Save private draft</Button>
          </form>
        )}
        {current && actions.length > 0 && (
          <form onSubmit={decide} className="mt-6 space-y-4 border-t border-border pt-6">
            <h3 className="font-semibold">
              Explicit review action on saved version {current.version}
            </h3>
            <label className="block">
              Action
              <select
                required
                className={field}
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value);
                  setDecisionKey(crypto.randomUUID());
                }}
              >
                <option value="">Choose an action</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {
                      {
                        submit: "Submit for review",
                        request_changes: "Request changes",
                        approve: "Approve reviewed content",
                        publish: "Publish approved version",
                        archive: "Archive version",
                      }[a]
                    }
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Reason, including required review confirmation
              <textarea
                required
                maxLength={1000}
                className={field}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {selectedAction === "publish" && (
              <>
                <p>
                  Publication preview: the saved version above becomes public at the chosen time,
                  replacing its previous effective version. Unpublished edits remain private.
                </p>
                <label className="block">
                  Effective date/time — Harare (UTC+02:00)
                  <input
                    required
                    type="datetime-local"
                    className={field}
                    value={effective}
                    onChange={(e) => setEffective(e.target.value)}
                  />
                </label>
              </>
            )}
            <Button
              disabled={
                busy ||
                !selectedAction ||
                (["approve", "publish"].includes(selectedAction) && current.missing.length > 0)
              }
            >
              Record content action
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
