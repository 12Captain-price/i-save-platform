import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { contentSupportApi as api, harareDate, officeInstant } from "@/lib/content-support-api";
const field = "mt-2 w-full rounded-md border border-border bg-background p-3";
type Fields = { subject: string; message: string; audience: string; scheduled_at: string | null };
type Campaign = {
  id: number;
  version: number;
  state: string;
  fields: Fields;
  content_version_id: number;
  base_event: number;
  scheduled_at: string | null;
  counts: Record<string, number>;
  history: { id: number; action: string; reason: string; actor: string; recorded_at: string }[];
  versions: { id: number; version: number; fields: Fields; actor: string; recorded_at: string }[];
};
type Preview = {
  subject: string;
  message: string;
  linked_content_version_id: number;
  linked_content: { fields: { title: string }; version: number } | null;
  public_url: string | null;
  audience: string;
  eligible_count: number;
  scheduled_at: string | null;
  preview_digest: string;
  missing: string[];
  delivery_available: boolean;
  delivery_mode: string;
  production_blockers: string[];
};
type Recipient = {
  id: number;
  email: string;
  state: string;
  reason: string;
  attempts: number;
  attempted_at: string | null;
  history: { state: string; reason: string; recorded_at: string }[];
};
function Retry({ recipient, onDone }: { recipient: Recipient; onDone: () => void }) {
  const [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false),
    [key] = useState(crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("/api/campaigns/recipients/" + recipient.id + "/retry", {
            reason,
            confirm,
            request_key: key,
          });
          onDone();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <p role="alert">{error}</p>}
      <label className="block">
        Retry reason
        <input
          required
          maxLength={1000}
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex gap-3">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />I
        confirm this failed before submission and request one retry, with eligibility checked again.
      </label>
      <Button disabled={busy || !confirm}>Retry delivery {recipient.id}</Button>
    </form>
  );
}
export function Campaigns() {
  const caps = useAuth().identity?.permissions ?? [],
    allowed = caps.includes("campaigns:read");
  const [items, setItems] = useState<Campaign[]>([]),
    [choices, setChoices] = useState<
      { id: number; title: string; kind: string; version: number }[]
    >([]),
    [current, setCurrent] = useState<Campaign | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [total, setTotal] = useState(0),
    [skip, setSkip] = useState(0),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [content, setContent] = useState(""),
    [subject, setSubject] = useState(""),
    [message, setMessage] = useState(""),
    [schedule, setSchedule] = useState(""),
    [reason, setReason] = useState(""),
    [action, setAction] = useState(""),
    [confirm, setConfirm] = useState(false),
    [key, setKey] = useState(crypto.randomUUID()),
    [decisionKey, setDecisionKey] = useState(crypto.randomUUID()),
    [recipients, setRecipients] = useState<Recipient[] | null>(null),
    [recipientTotal, setRecipientTotal] = useState(0),
    [recipientSkip, setRecipientSkip] = useState(0),
    [deliveryState, setDeliveryState] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [list, content] = await Promise.all([
        api(
          "/api/campaigns?" + new URLSearchParams({ q: search, skip: String(skip), limit: "20" }),
        ),
        api("/api/campaigns/content"),
      ]);
      setItems(list.items);
      setCurrent((selected) => {
        if (!selected || !["Queued", "Complete", "Cancelled"].includes(selected.state))
          return selected;
        return list.items.find((row: Campaign) => row.id === selected.id) ?? selected;
      });
      setTotal(list.total);
      setChoices(content.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (allowed) void load();
  }, [allowed, skip, search]);
  function choose(c: Campaign | null) {
    setCurrent(c);
    setPreview(null);
    setContent(c ? String(c.content_version_id) : "");
    setSubject(c?.fields.subject ?? "");
    setMessage(c?.fields.message ?? "");
    setSchedule(
      c?.fields.scheduled_at
        ? new Date(new Date(c.fields.scheduled_at).getTime() + 7200000).toISOString().slice(0, 16)
        : "",
    );
    setReason("");
    setAction("");
    setConfirm(false);
    setRecipients(null);
    setRecipientSkip(0);
    setKey(crypto.randomUUID());
    setDecisionKey(crypto.randomUUID());
  }
  async function showPreview() {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await api("/api/campaigns/" + current.id + "/preview"));
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const row = await api("/api/campaigns", {
        campaign_id: current?.id ?? null,
        base_version: current?.version ?? 0,
        content_version_id: Number(content),
        fields: {
          subject,
          message,
          audience: "active_opted_in_members",
          scheduled_at: schedule ? officeInstant(schedule) : null,
        },
        request_key: key,
      });
      choose(row);
      setNotice("Campaign draft saved. Nothing was queued or sent.");
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
      const row = await api("/api/campaigns/" + current.id + "/decision", {
        action,
        base_event: current.base_event,
        reason,
        confirm,
        preview_digest: preview?.preview_digest ?? "",
        request_key: decisionKey,
      });
      choose(row);
      setNotice(
        action === "queue"
          ? "Campaign queued. Queueing is not evidence of delivery."
          : "Campaign action saved.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deliveries(offset = 0) {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const d = await api(
        "/api/campaigns/" +
          current.id +
          "/recipients?" +
          new URLSearchParams({ state: deliveryState, skip: String(offset), limit: "20" }),
      );
      setRecipients(d.items);
      setRecipientTotal(d.total);
      setRecipientSkip(offset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <p role="alert">Campaign read permission is required. No recipient information is loaded.</p>
    );
  const canEdit =
    caps.includes("campaigns:prepare") &&
    (!current || ["Draft", "Approved"].includes(current.state));
  const actions = current
    ? [
        ...(caps.includes("campaigns:approve") && current.state === "Draft" ? ["approve"] : []),
        ...(caps.includes("campaigns:send") && current.state === "Approved" ? ["queue"] : []),
        ...(caps.includes("campaigns:send") &&
        ["Draft", "Approved", "Queued"].includes(current.state)
          ? ["cancel"]
          : []),
      ]
    : [];
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Optional announcement/event emails are separate from essential account notifications.
        Publication never sends a campaign. Only active Member accounts with explicit consent
        qualify. Eligibility and linked content are checked again before each submission. Production
        sending remains disabled.
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <p className="mt-2 text-sm">
            Your entries remain available. Retry an unchanged request after a lost response. Refresh
            before resolving a conflict.
          </p>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Loading campaign information…</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSkip(0);
          setSearch(query);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex-1">
          Search campaigns
          <input
            className={field}
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button disabled={busy}>Search campaigns</Button>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh campaigns
        </Button>
      </form>
      {!busy && !items.length && <p>No campaigns recorded on this page.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((c) => (
          <button
            key={c.id}
            className="rounded-xl border border-border bg-card p-5 text-left hover:border-primary"
            onClick={() => choose(c)}
          >
            <span className="text-sm text-primary">
              Campaign {c.id} · Version {c.version} · {c.state}
            </span>
            <h2 className="mt-2 break-words font-semibold">
              {c.fields.subject || "Incomplete private draft"}
            </h2>
            {c.scheduled_at && (
              <p className="mt-2 text-sm">Scheduled {harareDate(c.scheduled_at)}</p>
            )}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={busy || skip === 0}
          onClick={() => setSkip(Math.max(0, skip - 20))}
        >
          Previous
        </Button>
        <span>
          {total} campaigns · Page {skip / 20 + 1}
        </span>
        <Button
          variant="outline"
          disabled={busy || skip + 20 >= total}
          onClick={() => setSkip(skip + 20)}
        >
          Next
        </Button>
        {caps.includes("campaigns:prepare") && (
          <Button onClick={() => choose(null)}>New campaign draft</Button>
        )}
      </div>
      <section className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7">
        <h2 className="text-xl font-semibold">
          {current ? "Campaign " + current.id + " · " + current.state : "New private campaign"}
        </h2>
        {canEdit && (
          <form onSubmit={save} className="space-y-4">
            <label className="block">
              Effective published announcement or event
              <select
                required
                className={field}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              >
                <option value="">Choose published content</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · {c.kind} · Version {c.version} (ID {c.id})
                  </option>
                ))}
              </select>
            </label>
            {!choices.length && (
              <p>
                No effective published announcements or events are available. Publish approved
                content separately; no campaign will be created automatically.
              </p>
            )}
            <label className="block">
              Email subject
              <input
                maxLength={200}
                className={field}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label className="block">
              Campaign message — plain text
              <textarea
                rows={5}
                maxLength={4000}
                className={field}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <label className="block">
              Optional scheduled time — Harare (UTC+02:00)
              <input
                type="datetime-local"
                className={field}
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
            </label>
            <p className="text-sm">
              Blank means eligible for execution after explicit queue confirmation. Saving edits
              creates a new draft and requires approval again.
            </p>
            <Button disabled={busy || !content}>Save campaign draft</Button>
          </form>
        )}
        {current && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => void showPreview()}>
              Load saved publication and audience preview
            </Button>
            {preview && (
              <section
                className="space-y-3 rounded-lg border border-primary/30 p-4"
                aria-label="Saved campaign preview"
              >
                <h3 className="font-semibold">Saved-version preview</h3>
                <p>Subject: {preview.subject || "Missing decision"}</p>
                <p className="whitespace-pre-wrap break-words">
                  {preview.message || "Message not configured."}
                </p>
                <p>
                  Linked content version ID {preview.linked_content_version_id} ·{" "}
                  {preview.linked_content?.fields.title ?? "Unavailable"}
                </p>
                {preview.public_url && (
                  <a
                    className="break-all text-primary underline"
                    href={preview.public_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open exact public version
                  </a>
                )}
                <p>{preview.audience}</p>
                <p className="font-semibold">
                  Currently eligible recipients: {preview.eligible_count}
                </p>
                <p>
                  Scheduled:{" "}
                  {preview.scheduled_at
                    ? harareDate(preview.scheduled_at)
                    : "After explicit queue confirmation"}
                </p>
                <p>{preview.delivery_mode}</p>
                {preview.missing.map((m) => (
                  <p role="alert" key={m}>
                    {m}
                  </p>
                ))}
                <details>
                  <summary>Production readiness requirements</summary>
                  <ul className="mt-3 list-inside list-disc">
                    {preview.production_blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </details>
              </section>
            )}
            <section>
              <h3 className="font-semibold">Delivery results — separate states</h3>
              {Object.keys(current.counts).length ? (
                <ul className="mt-3 space-y-2">
                  {Object.entries(current.counts).map(([state, count]) => (
                    <li key={state}>
                      {state}: {count}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3">No recipients queued.</p>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                Attempted means the outcome may be unconfirmed. Mailpit accepted means local SMTP
                capture, not external or inbox delivery. Provider-accepted and delivered evidence
                are unavailable. Uncertain/attempted outcomes cannot be blindly retried. Recipient
                snapshots are historical; current preview counts may differ.
              </p>
            </section>
            {actions.length > 0 && (
              <form onSubmit={decide} className="space-y-4 border-t border-border pt-5">
                <label className="block">
                  Explicit campaign action
                  <select
                    required
                    className={field}
                    value={action}
                    onChange={(e) => {
                      setAction(e.target.value);
                      setConfirm(false);
                      setDecisionKey(crypto.randomUUID());
                    }}
                  >
                    <option value="">Choose action</option>
                    {actions.map((a) => (
                      <option value={a} key={a}>
                        {
                          {
                            approve: "Approve saved campaign",
                            queue: "Confirm and queue approved campaign",
                            cancel: "Cancel before dispatch",
                          }[a]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Reason for action
                  <textarea
                    required
                    maxLength={1000}
                    className={field}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {action === "queue" && (
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                    />
                    I reviewed the saved subject, message, exact public link, current audience count
                    and Harare schedule. I explicitly authorise queueing; dispatched email cannot be
                    recalled.
                  </label>
                )}
                <Button
                  disabled={
                    busy ||
                    !action ||
                    (action === "queue" &&
                      (!confirm ||
                        !preview ||
                        !preview.delivery_available ||
                        preview.missing.length > 0 ||
                        preview.eligible_count === 0))
                  }
                >
                  Record campaign action
                </Button>
              </form>
            )}
            <details>
              <summary>Approval/action history and retained draft versions</summary>
              {current.history.map((h) => (
                <p key={h.id} className="mt-3 text-sm">
                  {h.action} · {h.actor} · {harareDate(h.recorded_at)} · {h.reason}
                </p>
              ))}
              {current.versions.map((v) => (
                <article key={v.id} className="mt-4 rounded border border-border p-3">
                  <h4>
                    Campaign version {v.version} · {v.actor} · {harareDate(v.recorded_at)}
                  </h4>
                  <p className="mt-2">{v.fields.subject}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{v.fields.message}</p>
                </article>
              ))}
            </details>
            {caps.includes("campaigns:recipients") && (
              <section className="space-y-4 border-t border-border pt-5">
                <h3 className="font-semibold">Restricted recipient details — access is audited</h3>
                <label className="block">
                  Delivery state
                  <select
                    className={field}
                    value={deliveryState}
                    onChange={(e) => setDeliveryState(e.target.value)}
                  >
                    <option value="">All states</option>
                    {[
                      "Queued",
                      "Attempted",
                      "Mailpit accepted",
                      "Failed before submission",
                      "Uncertain",
                      "Suppressed",
                      "Cancelled",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <Button variant="outline" disabled={busy} onClick={() => void deliveries(0)}>
                  Load recipient details
                </Button>
                {recipients && (
                  <>
                    {!recipients.length && <p>No recipient deliveries match this page.</p>}
                    {recipients.map((r) => (
                      <article key={r.id} className="rounded-lg border border-border p-4">
                        <h4 className="break-all font-semibold">{r.email}</h4>
                        <p className="mt-2">
                          {r.state} · {r.attempts} attempts
                        </p>
                        <p className="mt-2">{r.reason}</p>
                        {r.attempted_at && <p>{harareDate(r.attempted_at)}</p>}
                        <details className="mt-3">
                          <summary>Attempt history</summary>
                          {r.history.map((h, i) => (
                            <p className="mt-2 text-sm" key={i}>
                              {h.state} · {harareDate(h.recorded_at)} · {h.reason}
                            </p>
                          ))}
                        </details>
                        {r.state === "Failed before submission" &&
                          caps.includes("campaigns:send") && (
                            <Retry
                              recipient={r}
                              onDone={() => {
                                void deliveries(recipientSkip);
                                void load();
                              }}
                            />
                          )}
                      </article>
                    ))}
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        disabled={busy || recipientSkip === 0}
                        onClick={() => void deliveries(Math.max(0, recipientSkip - 20))}
                      >
                        Previous recipients
                      </Button>
                      <span>{recipientTotal} recipient records</span>
                      <Button
                        variant="outline"
                        disabled={busy || recipientSkip + 20 >= recipientTotal}
                        onClick={() => void deliveries(recipientSkip + 20)}
                      >
                        Next recipients
                      </Button>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export function MarketingPreferences() {
  const allowed = useAuth().identity?.permissions.includes("marketing:own");
  const [data, setData] = useState<{
      enabled: boolean;
      revision: number;
      version: string;
      wording: string;
      history: {
        enabled: boolean;
        source: string;
        version: string;
        wording: string;
        recorded_at: string;
      }[];
    } | null>(null),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [key, setKey] = useState(crypto.randomUUID());
  async function load() {
    setBusy(true);
    setError("");
    try {
      const d = await api("/api/marketing/preferences");
      setData(d);
      setEnabled(d.enabled);
      setKey(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);
  if (!allowed)
    return <p role="alert">Only Members can manage their own optional-email preferences.</p>;
  return (
    <section className="max-w-3xl space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Optional announcement and event emails</h2>
      <p>
        Membership and an email address do not imply promotional consent. Essential account/security
        notifications remain independent of this preference. No promotional consent has been
        imported.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Loading preferences…</p>}
      <Button variant="outline" disabled={busy} onClick={() => void load()}>
        Refresh email preferences
      </Button>
      {data && (
        <>
          <p>Saved preference: {data.enabled ? "Opted in" : "Not opted in"}</p>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const d = await api("/api/marketing/preferences", {
                  enabled,
                  base_revision: data.revision,
                  version: data.version,
                  request_key: key,
                });
                setData(d);
                setEnabled(d.enabled);
                setKey(crypto.randomUUID());
                setNotice("Your optional-email preference is saved.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              {data.wording}
            </label>
            <p className="text-sm text-muted-foreground">
              Clear the checkbox and save to withdraw consent. This does not disable essential
              notifications.
            </p>
            <Button disabled={busy}>Save optional-email preference</Button>
          </form>
          <details>
            <summary>Consent history</summary>
            {data.history.length ? (
              data.history.map((h, i) => (
                <div key={i} className="mt-4 text-sm">
                  <p>
                    {h.enabled ? "Opted in" : "Withdrawn"} · {h.source} · {h.version} ·{" "}
                    {harareDate(h.recorded_at)}
                  </p>
                  <p className="mt-2">{h.wording}</p>
                </div>
              ))
            ) : (
              <p className="mt-3">No consent changes recorded.</p>
            )}
          </details>
        </>
      )}
    </section>
  );
}
