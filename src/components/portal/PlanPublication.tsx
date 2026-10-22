import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Feedback, useRecords } from "./AdminDataScreens";

export function PlanPublication({ id, onChange }: { id: number; onChange: () => void }) {
  const auth = useAuth();
  const r = useRecords<{
    latest: { version: number };
    publication_preview: {
      blockers: string[];
      approved_by: string | null;
      approved_at: string | null;
      published_by: string | null;
      effective_at: string | null;
      withdrawal_access: string;
      missed_target_policy: string;
      impact: string;
    };
    publication_history: {
      version: number;
      approved_by: string | null;
      published_by: string | null;
      effective_at: string | null;
    }[];
  }>(`/api/admin/plan-drafts/${id}`);
  const [ack, setAck] = useState(false),
    [effective, setEffective] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ action: string; body: object } | null>(null);
  async function act(action: string) {
    if (!r.data) return;
    const req = pending ?? {
      action,
      body: {
        request_key: crypto.randomUUID(),
        version: r.data.latest.version,
        acknowledged: ack,
        effective_at: action === "publish" && effective ? new Date(effective).toISOString() : null,
      },
    };
    setPending(req);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/plan-drafts/${id}/${req.action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Isave-Request": "1" },
        body: JSON.stringify(req.body),
      });
      if (response.status === 401) await auth.refresh();
      const data = await response.json();
      if (!response.ok) {
        if ([400, 403, 409].includes(response.status)) setPending(null);
        throw Error(data.error ?? "Action could not be confirmed.");
      }
      setPending(null);
      setAck(false);
      setNotice(
        req.action === "approve"
          ? "Terms approval recorded. Publication remains a separate action."
          : "Plan version published or scheduled. Existing accepted terms and obligations are unchanged.",
      );
      r.reload();
      onChange();
    } catch (e) {
      setError(
        e instanceof Error && !(e instanceof TypeError)
          ? e.message
          : "Action could not be confirmed. Retry the same action.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (r.error) return <Feedback {...r} />;
  if (!r.data) return <p role="status">Loading publication preview…</p>;
  const p = r.data.publication_preview;
  return (
    <section
      aria-label="Plan publication preview"
      className="space-y-4 rounded-xl border border-primary/30 bg-card p-5 sm:p-8"
    >
      <h2 className="text-xl font-semibold">Approval and publication preview</h2>
      <p className="text-sm">
        Review the complete saved terms above. Publication supports member-chosen weekly targets in
        USD or ZiG for eight calendar months only. No amounts or limits are pre-approved.
      </p>
      <p className="text-sm text-muted-foreground">{p.impact}</p>
      <p className="text-sm">{p.missed_target_policy}</p>
      <p className="text-sm">{p.withdrawal_access}</p>
      {p.blockers.length > 0 ? (
        <div role="status">
          <h3 className="font-semibold">Decisions required before approval/publication</h3>
          <ul className="mt-2 list-disc space-y-1 break-words pl-5 text-sm text-muted-foreground">
            {p.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-primary">
          Required configuration is complete. Explicit approval and publication are still separate.
        </p>
      )}
      {p.approved_by && (
        <p role="status" className="text-sm">
          Approved by {p.approved_by} · {p.approved_at && new Date(p.approved_at).toLocaleString()}
        </p>
      )}
      {p.published_by ? (
        <p role="status" className="text-sm text-primary">
          Published/scheduled by {p.published_by} · Effective{" "}
          {p.effective_at && new Date(p.effective_at).toLocaleString()}
        </p>
      ) : (
        <fieldset disabled={busy || !!pending} className="space-y-4">
          <legend className="sr-only">Explicit plan terms decision</legend>
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-primary"
            />
            I have reviewed the complete saved terms and explicitly authorise this{" "}
            {p.approved_by ? "publication" : "terms approval"}. This does not enrol members, create
            payments or enable unavailable financial services.
          </label>
          {p.approved_by && (
            <label className="block text-sm">
              Effective date/time (blank means now)
              <input
                type="datetime-local"
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
                className="mt-2 block w-full rounded-md border border-input bg-background p-3"
              />
            </label>
          )}
          <Button
            disabled={
              !ack ||
              !!p.blockers.length ||
              !auth.identity?.permissions.includes(
                p.approved_by ? "plans:publish" : "plans:approve",
              )
            }
            onClick={() => void act(p.approved_by ? "publish" : "approve")}
          >
            {p.approved_by ? "Publish approved version" : "Approve saved terms"}
          </Button>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <Button disabled={busy} onClick={() => void act(pending.action)}>
          Retry same publication action
        </Button>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-primary">
          Approval/publication history
        </summary>
        <ul className="mt-3 space-y-3 text-sm">
          {r.data.publication_history.map((h) => (
            <li key={h.version}>
              Version {h.version} · Approval: {h.approved_by ?? "Not approved"} · Publication:{" "}
              {h.published_by ?? "Not published"}
              {h.effective_at && ` · Effective ${new Date(h.effective_at).toLocaleString()}`}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
