import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Feedback, useRecords } from "./AdminDataScreens";

export type PlanTerms = {
  category: string;
  description: string;
  currency: string;
  minimum_amount: string | null;
  maximum_amount: string | null;
  duration_months: number;
  missed_contributions: string;
  extra_contributions: string;
};
export type PlanOffer = {
  draft_id: number;
  version_id: number;
  version: number;
  terms: PlanTerms;
  acknowledgement: string;
  acknowledgement_version: string;
  withdrawal_access: string;
  missed_target_policy: string;
  notice: string;
};
export type PlanRequest = {
  id: number;
  member_id: number;
  member_name?: string;
  member_number?: string;
  version_id: number;
  terms: PlanTerms;
  weekly_target: string;
  currency: string;
  status: string;
  acknowledgement: string;
  acknowledgement_version: string;
  acknowledged_at: string;
  withdrawal_access: string;
  missed_target_policy: string;
  enrolment: null | {
    start_date: string;
    end_date: string;
    activated_at: string;
    activated_by: string;
  };
  history: { status: string; reason: string; actor: string; recorded_at: string }[];
};
const panel = "space-y-4 rounded-xl border border-border bg-card p-5 sm:p-7";
export function PlanInformation({ plan }: { plan: PlanOffer | PlanRequest }) {
  const t = plan.terms;
  return (
    <div className="space-y-3 text-sm">
      <h3 className="text-lg font-semibold capitalize">
        {t.category} · {t.currency === "ZWG" ? "ZiG" : t.currency}
      </h3>
      <p className="whitespace-pre-wrap break-words text-muted-foreground">{t.description}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Weekly target</dt>
          <dd>
            {"weekly_target" in plan ? `${plan.weekly_target} ${plan.currency}` : "Member-chosen"}
            {t.minimum_amount ? ` · Minimum ${t.minimum_amount}` : ""}
            {t.maximum_amount ? ` · Maximum ${t.maximum_amount}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Programme duration</dt>
          <dd>Eight calendar months from active enrolment</dd>
        </div>
      </dl>
      <p>{plan.missed_target_policy}</p>
      <p className="whitespace-pre-wrap break-words">
        Recorded missed-contribution wording: {t.missed_contributions}
      </p>
      <p className="whitespace-pre-wrap break-words">
        Extra-contribution rules: {t.extra_contributions}
      </p>
      <p>
        Extra contributions are voluntary. No automatic financial posting, collection, penalties,
        deductions, debt or suspension is enabled.
      </p>
      <p>{plan.withdrawal_access}</p>
      <p>
        Benefits and returns are unavailable. No automatic savings conversion. USD and ZiG remain
        separate. Approval or activation creates no payment and increases no savings.
      </p>
      <p className="text-xs text-muted-foreground">
        Terms version ID: {plan.version_id}
        {"version" in plan ? ` · Draft version ${plan.version}` : ""}
      </p>
    </div>
  );
}

export function PlanOffers({
  category,
  member = false,
  onApplied,
}: {
  category?: string;
  member?: boolean;
  onApplied?: () => void;
}) {
  const result = useRecords<{ items: PlanOffer[] }>(
    "/api/public/plan-offers" + (category ? "?category=" + encodeURIComponent(category) : ""),
  );
  if (result.error) return <Feedback {...result} />;
  if (!result.data) return <p role="status">Loading effective published plans…</p>;
  return (
    <section className="space-y-5" aria-label="Effective published plans">
      <h2 className="text-xl font-semibold">Effective published plans</h2>
      <p className="text-sm text-muted-foreground">
        Category interest, a plan application and an active enrolment are separate records. Only
        effective published terms appear here.
      </p>
      {result.data.items.length === 0 ? (
        <p role="status">
          No effective published plans are available. Drafts are not offers. Contact the office for
          guidance.
        </p>
      ) : (
        result.data.items.map((plan) => (
          <article key={plan.version_id} className={panel}>
            <PlanInformation plan={plan} />
            {member ? (
              <ApplyForm plan={plan} onApplied={onApplied ?? (() => {})} />
            ) : (
              <Button variant="outline" asChild>
                <Link to="/portal/$role/$screen" params={{ role: "member", screen: "plans" }}>
                  Sign in to apply as an activated member
                </Link>
              </Button>
            )}
          </article>
        ))
      )}
    </section>
  );
}

function ApplyForm({ plan, onApplied }: { plan: PlanOffer; onApplied: () => void }) {
  const auth = useAuth();
  const [amount, setAmount] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [pending, setPending] = useState<object | null>(null);
  return (
    <form
      className="space-y-4 border-t border-border pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = pending ?? {
          request_key: crypto.randomUUID(),
          version_id: plan.version_id,
          weekly_target: amount,
          acknowledged: ack,
          acknowledgement_version: plan.acknowledgement_version,
        };
        setPending(body);
        setBusy(true);
        setError("");
        setNotice("");
        try {
          const response = await fetch("/api/member/plan-applications", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Isave-Request": "1" },
            body: JSON.stringify(body),
          });
          if (response.status === 401) await auth.refresh();
          const data = await response.json();
          if (!response.ok) {
            if ([400, 403, 409].includes(response.status)) setPending(null);
            throw Error(data.error ?? "Application could not be confirmed.");
          }
          setPending(null);
          setNotice(
            "Plan application recorded. Authorised review and separate activation are required. No payment was recorded and savings have not increased.",
          );
          setAck(false);
          onApplied();
        } catch (e) {
          setError(
            e instanceof Error && !(e instanceof TypeError)
              ? e.message
              : "Application could not be confirmed. Retry the same submission.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy || !!pending} className="space-y-4">
        <legend className="font-semibold">Apply for this plan</legend>
        <label className="block text-sm">
          Your weekly target in {plan.terms.currency === "ZWG" ? "ZiG" : plan.terms.currency}
          <input
            type="number"
            min={plan.terms.minimum_amount ?? "0.01"}
            max={plan.terms.maximum_amount ?? undefined}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="mt-2 block w-full rounded-md border border-input bg-background p-3"
          />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            required
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-primary"
          />
          {plan.acknowledgement}
        </label>
      </fieldset>
      <Button type="submit" disabled={busy || (!pending && !ack)}>
        {busy ? "Submitting…" : pending ? "Retry same plan application" : "Submit plan application"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}

export function PlanApplicationRecord({ record }: { record: PlanRequest }) {
  return (
    <article className={panel}>
      <p className="font-semibold text-primary">
        Plan application {record.id} · {record.status}
      </p>
      <PlanInformation plan={record} />
      {record.enrolment && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          Active enrolment · Start {record.enrolment.start_date} · Programme completion{" "}
          {record.enrolment.end_date}. Withdrawal processing remains unavailable.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-primary">
          Accepted terms and status history
        </summary>
        <p className="mt-3 text-sm">{record.acknowledgement}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {record.acknowledgement_version} · {new Date(record.acknowledged_at).toLocaleString()}
        </p>
        <ul className="mt-3 space-y-3 text-sm">
          {record.history.map((h, i) => (
            <li key={i} className="whitespace-pre-wrap break-words border-l border-primary/30 pl-3">
              {h.status} · {h.actor} · {new Date(h.recorded_at).toLocaleString()}
              <p className="mt-1 text-muted-foreground">{h.reason}</p>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

export function MemberPlans({ applicationsOnly = false }: { applicationsOnly?: boolean }) {
  const auth = useAuth();
  return auth.identity?.permissions.includes("plans:own") ? (
    <MemberPlansContent applicationsOnly={applicationsOnly} />
  ) : (
    <p role="alert">Member plan access permission is required.</p>
  );
}
function MemberPlansContent({ applicationsOnly }: { applicationsOnly: boolean }) {
  const result = useRecords<{ items: PlanRequest[] }>("/api/member/plan-applications");
  return (
    <div className="space-y-8">
      {!applicationsOnly && <PlanOffers member onApplied={result.reload} />}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Your plan applications and enrolments</h2>
        {result.error ? (
          <Feedback {...result} />
        ) : !result.data ? (
          <p role="status">Loading your plan records…</p>
        ) : result.data.items.length === 0 ? (
          <p role="status">
            No plan applications or active enrolments recorded. Category interests do not create
            them.
          </p>
        ) : (
          result.data.items.map((record) => (
            <PlanApplicationRecord key={record.id} record={record} />
          ))
        )}
      </section>
    </div>
  );
}

export function MemberPlanSummary() {
  const auth = useAuth();
  return (
    <section className={panel}>
      <h2 className="text-lg font-semibold">Plan applications and enrolments</h2>
      <p className="text-sm text-muted-foreground">
        Category interests remain separate. Review your exact accepted terms, application status and
        activation dates on the connected plans screen.
      </p>
      {auth.identity?.permissions.includes("plans:own") ? (
        <OwnedPlanSummary />
      ) : (
        <p>Member plan access permission is required.</p>
      )}
    </section>
  );
}

function OwnedPlanSummary() {
  const r = useRecords<{ items: PlanRequest[] }>("/api/member/plan-applications");
  return (
    <div className="space-y-3">
      {r.error ? (
        <Feedback {...r} />
      ) : !r.data ? (
        <p role="status">Loading enrolment summary...</p>
      ) : r.data.items.length === 0 ? (
        <p className="text-sm">No formal plan applications or enrolments recorded.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {r.data.items.map((p) => (
            <li key={p.id} className="rounded-lg border border-border p-3">
              {p.terms.category} · {p.status} · Weekly target {p.weekly_target} {p.currency}
              {p.enrolment && (
                <p className="mt-2">
                  Start {p.enrolment.start_date} · Programme completion {p.enrolment.end_date}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" asChild>
        <Link to="/portal/$role/$screen" params={{ role: "member", screen: "plans" }}>
          View plans and enrolments
        </Link>
      </Button>
    </div>
  );
}
