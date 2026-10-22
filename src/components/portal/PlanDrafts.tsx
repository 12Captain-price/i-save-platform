import { useState } from "react";
import { PlanPublication } from "./PlanPublication";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { useRecords, Feedback } from "./AdminDataScreens";

const labels = {
  category: "Category",
  description: "Description",
  currency: "Currency",
  contribution_mode: "Contribution amount choice",
  fixed_amount: "Fixed contribution amount",
  minimum_amount: "Minimum amount (optional)",
  maximum_amount: "Maximum amount (optional)",
  cadence: "Contribution cadence",
  duration_mode: "Duration choice",
  duration_weeks: "Duration in weeks",
  missed_contributions: "Proposed missed-contribution rules",
  extra_contributions: "Proposed extra-contribution rules",
  duration_months: "Duration in calendar months",
  missed_target_policy: "Missed-target policy",
  extra_contribution_policy: "Extra-contribution policy",
  withdrawal_access: "Withdrawal-access boundary",
  benefits_policy: "Benefits and returns",
};
type Field = keyof typeof labels;
type Terms = Record<Field, string | number | null>;
type Draft = {
  draft_id: number;
  version: number;
  terms: Terms;
  missing_decisions: Field[];
  status: string;
  actor_email: string;
  recorded_at: string;
};
const blank = (): Terms => Object.fromEntries(Object.keys(labels).map((k) => [k, null])) as Terms;
const inputClass =
  "mt-2 w-full min-w-0 rounded-md border border-input bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const options: Partial<Record<Field, [string, string][]>> = {
  category: ["asset", "holiday", "emergency", "retrenchment", "education"].map((v) => [
    v,
    v[0]!.toUpperCase() + v.slice(1),
  ]),
  contribution_mode: [
    ["fixed", "Fixed amount"],
    ["member_chosen", "Member-chosen amount"],
  ],
  cadence: [["weekly", "Weekly"]],
  duration_mode: [
    ["calendar_months", "Calendar months from active enrolment"],
    ["fixed", "Fixed number of weeks (draft only)"],
    ["open_ended", "Open-ended (draft only)"],
  ],
  missed_target_policy: [
    ["no_automatic_consequences", "No automatic penalties, deductions, debt or suspension"],
  ],
  extra_contribution_policy: [
    [
      "voluntary_no_automatic_posting",
      "Voluntary extra contributions; no automatic financial posting",
    ],
  ],
  withdrawal_access: [
    [
      "after_completion_14_days_notice_review_unavailable",
      "After completion, at least two weeks’ request notice and authorised review; processing unavailable",
    ],
  ],
  benefits_policy: [["unavailable", "Benefits and returns unavailable"]],
};
const amounts: Field[] = ["fixed_amount", "minimum_amount", "maximum_amount"];

function Snapshot({ draft }: { draft: Draft }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-primary">
        Version {draft.version} · {draft.status}
      </p>
      <p className="break-words text-xs text-muted-foreground">
        Saved by {draft.actor_email} · {new Date(draft.recorded_at).toLocaleString()}
      </p>
      <p className="text-sm">
        {draft.missing_decisions.length
          ? `Missing decisions: ${draft.missing_decisions.map((k) => labels[k]).join(", ")}.`
          : "Configuration fields recorded. Separate explicit terms approval and publication are required."}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(labels) as Field[]).map((k) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{labels[k]}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm">
              {draft.terms[k] ?? "Not decided"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Editor({ draft, onSaved }: { draft: Draft | null; onSaved: () => void }) {
  const auth = useAuth();
  const [terms, setTerms] = useState<Terms>(draft?.terms ?? blank());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Retain the exact request after an uncertain response; retry cannot create a second version.
  const [pending, setPending] = useState<{
    request_key: string;
    base_version: number;
    terms: Terms;
  } | null>(null);
  const update = (key: Field, value: string) =>
    setTerms((previous) => {
      const next = { ...previous, [key]: value || null };
      if (key === "contribution_mode" && value === "member_chosen") next.fixed_amount = null;
      if (key === "duration_mode" && value === "open_ended") next.duration_weeks = null;
      if (key === "duration_mode") {
        if (value === "calendar_months") next.duration_weeks = null;
        else next.duration_months = null;
      }
      return next;
    });
  return (
    <form
      className="space-y-6 rounded-xl border border-primary/30 bg-card p-5 sm:p-8"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const body = pending ?? {
          request_key: crypto.randomUUID(),
          base_version: draft?.version ?? 0,
          terms: {
            ...terms,
            duration_weeks: terms.duration_weeks === null ? null : Number(terms.duration_weeks),
            duration_months: terms.duration_months == null ? null : Number(terms.duration_months),
          },
        };
        setPending(body);
        try {
          const response = await fetch(
            `/api/admin/plan-drafts${draft ? `/${draft.draft_id}` : ""}`,
            {
              method: draft ? "PUT" : "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json", "X-Isave-Request": "1" },
              body: JSON.stringify(body),
            },
          );
          if (response.status === 401) {
            await auth.refresh();
            throw new Error("Your session has expired. Please log in again.");
          }
          if (!response.ok) {
            if ([400, 403, 409].includes(response.status)) setPending(null);
            throw new Error(
              response.status === 409
                ? "This draft changed or the request conflicts. Reload the draft before saving again."
                : response.status === 403
                  ? "You do not have permission to save drafts."
                  : response.status === 400
                    ? "Check the field values: positive amounts, ordered limits, three-letter currency and whole weeks."
                    : "Save could not be confirmed. Retry the same save before making further changes.",
            );
          }
          onSaved();
        } catch (e) {
          setError(
            e instanceof Error && !(e instanceof TypeError)
              ? e.message
              : "Save could not be confirmed. Retry the same save before making further changes.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-xl font-semibold">
        {draft
          ? `Edit draft ${draft.draft_id} · version ${draft.version}`
          : "New unpublished draft"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Leave undecided fields empty. Enter only proposed configuration; saving does not approve
        policy or offer a plan to members. Amounts and limits are per weekly contribution.
      </p>
      <fieldset disabled={busy || pending !== null} className="grid min-w-0 gap-5 sm:grid-cols-2">
        <legend className="sr-only">Draft configuration</legend>
        {(Object.keys(labels) as Field[])
          .filter(
            (k) =>
              !(k === "fixed_amount" && terms.contribution_mode === "member_chosen") &&
              !(
                k === "duration_weeks" &&
                ["open_ended", "calendar_months"].includes(String(terms.duration_mode))
              ) &&
              !(k === "duration_months" && terms.duration_mode !== "calendar_months"),
          )
          .map((key) => (
            <label
              key={key}
              className={`min-w-0 text-sm font-medium ${["description", "missed_contributions", "extra_contributions"].includes(key) ? "sm:col-span-2" : ""}`}
            >
              {labels[key]}
              {options[key] ? (
                <select
                  aria-label={labels[key]}
                  className={inputClass}
                  value={terms[key] ?? ""}
                  onChange={(e) => update(key, e.target.value)}
                >
                  <option value="">Not decided</option>
                  {options[key]!.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              ) : ["description", "missed_contributions", "extra_contributions"].includes(key) ? (
                <textarea
                  aria-label={labels[key]}
                  className={inputClass}
                  rows={3}
                  maxLength={4000}
                  value={terms[key] ?? ""}
                  onChange={(e) => update(key, e.target.value)}
                />
              ) : (
                <input
                  aria-label={labels[key]}
                  className={inputClass}
                  type={amounts.includes(key) || ['duration_weeks','duration_months'].includes(key) ? "number" : "text"}
                  step={['duration_weeks','duration_months'].includes(key) ? "1" : "0.01"}
                  min={['duration_weeks','duration_months'].includes(key) ? "1" : "0.01"}
                  maxLength={key === "currency" ? 3 : undefined}
                  value={terms[key] ?? ""}
                  onChange={(e) =>
                    update(key, key === "currency" ? e.target.value.toUpperCase() : e.target.value)
                  }
                />
              )}
            </label>
          ))}
      </fieldset>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Missed and extra contribution rules are proposals only. No penalties, withdrawals, returns,
        billing or financial posting are enabled.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : pending ? "Retry same save" : "Save unpublished draft"}
      </Button>
    </form>
  );
}

export function PlanDrafts() {
  const auth = useAuth();
  const canRead = auth.identity?.permissions.includes("plans:drafts:read");
  return canRead ? (
    <DraftDirectory />
  ) : (
    <section role="alert">Access denied. Administrator draft-read permission is required.</section>
  );
}

function DraftDirectory() {
  const auth = useAuth();
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const result = useRecords<{ items: Draft[]; total: number }>(
    `/api/admin/plan-drafts?skip=${skip}&limit=10`,
  );
  const canWrite = auth.identity?.permissions.includes("plans:drafts:write");
  const saved = () => {
    setSelected(null);
    setCreating(false);
    setNotice("Draft saved. It remains unpublished and unavailable for enrolment.");
    result.reload();
  };
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <h2 className="text-xl font-semibold">Draft savings-plan configuration</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Draft saves remain unpublished. Only complete, explicitly approved and effective published
          versions can be offered for plan applications. Savings-category interests and active
          enrolments remain separate.
        </p>
      </section>
      <div className="flex flex-wrap gap-3">
        {canWrite && (
          <Button
            onClick={() => {
              setCreating(true);
              setSelected(null);
              setNotice("");
            }}
          >
            Create draft
          </Button>
        )}
        <Button variant="outline" onClick={result.reload}>
          Refresh drafts
        </Button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {creating && <Editor key="new" draft={null} onSaved={saved} />}
      {selected !== null && (
        <DraftDetail key={selected} id={selected} canWrite={!!canWrite} onSaved={saved} onPublicationChange={() => { setNotice(""); result.reload(); }} />
      )}
      {result.error ? (
        <Feedback {...result} />
      ) : !result.data ? (
        <p role="status">Loading drafts…</p>
      ) : (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-8">
          <h2 className="text-xl font-semibold">Saved drafts</h2>
          {result.data.items.length === 0 ? (
            <p>No drafts on this page. No plans have been published by this workflow.</p>
          ) : (
            result.data.items.map((draft) => (
              <article key={draft.draft_id} className="rounded-lg border border-border p-4">
                <p className="font-semibold">
                  Draft {draft.draft_id} · {String(draft.terms.category ?? "Category undecided")}
                </p>
                <p className="my-2 text-sm text-muted-foreground">
                  {draft.status} · version {draft.version} · {draft.missing_decisions.length} missing
                  decisions
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setNotice("");
                    setSelected(draft.draft_id);
                    setCreating(false);
                  }}
                >
                  Review draft {draft.draft_id}
                </Button>
              </article>
            ))
          )}
          <nav aria-label="Draft pages" className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - 10))}
            >
              Previous
            </Button>
            <span className="text-sm">
              {result.data.total} drafts · Page {skip / 10 + 1}
            </span>
            <Button
              variant="outline"
              disabled={skip + 10 >= result.data.total}
              onClick={() => setSkip(skip + 10)}
            >
              Next
            </Button>
          </nav>
        </section>
      )}
    </div>
  );
}

function DraftDetail({
  id,
  canWrite,
  onSaved,
  onPublicationChange,
}: {
  id: number;
  canWrite: boolean;
  onSaved: () => void;
  onPublicationChange: () => void;
}) {
  const result = useRecords<{ latest: Draft; history: Draft[] }>(`/api/admin/plan-drafts/${id}`);
  if (result.error) return <Feedback {...result} />;
  if (!result.data) return <p role="status">Loading draft history…</p>;
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={result.reload}>
        Reload latest draft (discard unsaved edits)
      </Button>
      {canWrite && (
        <Editor key={result.data.latest.version} draft={result.data.latest} onSaved={onSaved} />
      )}
      <PlanPublication id={id} onChange={() => { result.reload(); onPublicationChange(); }} />
      <section className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-8">
        <h2 className="text-xl font-semibold">Version history</h2>
        {result.data.history.map((draft) => (
          <details
            key={draft.version}
            className="rounded-lg border border-border p-4"
            open={draft.version === result.data!.latest.version}
          >
            <summary className="cursor-pointer text-sm font-semibold">
              Version {draft.version} · {draft.actor_email}
            </summary>
            <div className="mt-4">
              <Snapshot draft={draft} />
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
