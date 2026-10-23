import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Feedback, useRecords } from "./AdminDataScreens";

export type SavingsSummaryData = {
  available: boolean;
  confirmed: { currency: string; amount: string }[];
  reserved?: { currency: string; amount: string }[];
  available_funds?: { currency: string; amount: string }[];
  pending: { currency: string; amount: string }[];
  legacy_requires_review: number;
  message: string;
};
type Entry = {
  id: number;
  enrolment_id: number;
  amount: string;
  currency: string;
  payment_date: string;
  method: string;
  reference: string;
  status: string;
  flags: string[];
  policy: { separation: string; explicitly_configured: boolean };
  base_event_id: number;
  receipt_available: boolean;
  history: {
    id: number;
    action: string;
    outcome: string;
    evidence_reference: string;
    reason: string;
    actor: string;
    recorded_at: string;
  }[];
  ledger: {
    id: number;
    kind: string;
    amount: string;
    currency: string;
    reverses_id: number | null;
  }[];
};
const panel = "min-w-0 space-y-4 rounded-xl border border-border bg-card p-5 sm:p-7";
const input =
  "mt-2 block min-h-11 w-full min-w-0 rounded-md border border-input bg-background p-3 text-sm";
const money = (amount: string, currency: string) =>
  `${currency === "ZWG" ? "ZiG" : currency} ${amount}`;
export function SavingsSummary({ data }: { data: SavingsSummaryData }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Confirmed savings</h3>
      {data.confirmed.length ? (
        data.confirmed.map((t) => (
          <p key={t.currency} className="text-xl font-semibold text-primary">
            {money(t.amount, t.currency)}
          </p>
        ))
      ) : (
        <p>No confirmed ledger credits recorded.</p>
      )}
      {data.reserved&&<section aria-label="Reserved withdrawals"><h3 className="font-semibold">Reserved for pending withdrawals</h3>{data.reserved.length?data.reserved.map(t=><p key={t.currency}>{money(t.amount,t.currency)} reserved</p>):<p>No withdrawal funds reserved.</p>}</section>}
      {data.available_funds&&<section aria-label="Available savings"><h3 className="font-semibold">Available after withdrawal reservations</h3>{data.available_funds.length?data.available_funds.map(t=><p key={t.currency}>{money(t.amount,t.currency)} available</p>):<p>No available confirmed savings recorded.</p>}</section>}
      <h3 className="font-semibold">Pending — excluded from confirmed savings</h3>
      {data.pending.length ? (
        data.pending.map((t) => <p key={t.currency}>{money(t.amount, t.currency)}</p>)
      ) : (
        <p>No pending contributions recorded.</p>
      )}
      {!!data.legacy_requires_review && (
        <p className="text-sm">
          {data.legacy_requires_review} historical contribution record(s) require explicit
          reconciliation and are excluded.
        </p>
      )}
      <p className="text-sm text-muted-foreground">{data.message}</p>
    </div>
  );
}
export function SavingsWorkspace({
  member = false,
  initialStatus = "",
}: {
  member?: boolean;
  initialStatus?: string;
}) {
  const auth = useAuth(),
    has = (code: string) => !!auth.identity?.permissions.includes("savings:" + code);
  return (member ? has("own") : has("read")) ? (
    <SavingsContent member={member} initialStatus={initialStatus} />
  ) : (
    <p role="alert">
      Separate savings {member ? "ownership" : "read"} permission is required. No financial
      information is displayed.
    </p>
  );
}
function SavingsContent({ member, initialStatus }: { member: boolean; initialStatus: string }) {
  const auth = useAuth(),
    has = (code: string) => !!auth.identity?.permissions.includes("savings:" + code);
  const [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(initialStatus),
    [skip, setSkip] = useState(0);
  const result = useRecords<{ items: Entry[]; total: number; summary: SavingsSummaryData }>(
    `/api/savings?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&skip=${skip}&limit=10`,
  );
  const [pending, setPending] = useState<{ path: string; body: object } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<{ contribution: Entry; notice: string } | null>(null);
  async function save(path: string, body: object) {
    const req = pending ?? { path, body };
    setPending(req);
    setBusy(true);
    setError("");
    setNotice("");
    setReceipt(null);
    try {
      const r = await fetch(req.path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Isave-Request": "1" },
        body: JSON.stringify(req.body),
      });
      if (r.status === 401) await auth.refresh();
      const data = await r.json();
      if (!r.ok) {
        if ([400, 403, 404, 409].includes(r.status)) setPending(null);
        throw Error(data.error ?? "Contribution action could not be confirmed.");
      }
      setPending(null);
      setNotice(
        `Recorded status: ${data.status}. Only verified and reconciled ledger credits increase savings.`,
      );
      result.reload();
      return true;
    } catch (e) {
      setError(
        e instanceof Error && !(e instanceof TypeError)
          ? e.message
          : "Response uncertain. Retry the exact request below; do not record another payment.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function openReceipt(id: number) {
    setError("");
    try {
      const r = await fetch(`/api/savings/${id}/receipt`);
      if (r.status === 401) await auth.refresh();
      const data = await r.json();
      if (!r.ok) throw Error(data.error ?? "Receipt is unavailable.");
      setReceipt(data);
    } catch {
      setError("Receipt could not be loaded. Refresh and retry.");
    }
  }
  return (
    <div className="space-y-6">
      <section className={`${panel} border-primary/25`}>
        <h2 className="text-xl font-semibold">Savings contributions</h2>
        <p>
          {member ? "Your contributions remain pending until separately verified and reconciled. Only confirmed ledger entries count towards your savings. Weekly targets are not debts. Fees and subscriptions are separate." : "Office payments are pending until separately verified and reconciled. Weekly targets are not debts. Fees, subscriptions, returns and withdrawals are separate."}
        </p>
        {result.data && <SavingsSummary data={result.data.summary} />}
      </section>
      {error && (
        <p role="alert" className="break-words text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <Button disabled={busy} onClick={() => void save(pending.path, pending.body)}>
          Retry exact contribution request
        </Button>
      )}
      {!member && has("record") && <RecordForm disabled={busy || !!pending} save={save} />}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search);
          setSkip(0);
        }}
      >
        <label className="min-w-0 flex-1">
          Search payment reference
          <input
            className={input}
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Status
          <select
            className={input}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setSkip(0);
            }}
          >
            <option value="">All statuses</option>
            {[
              "Pending verification",
              "Verified",
              "Discrepancy",
              "Rejected",
              "Confirmed",
              "Reversed",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <Button>Search contributions</Button>
      </form>
      {result.error ? (
        <Feedback {...result} />
      ) : !result.data ? (
        <p role="status">Loading contributions…</p>
      ) : (
        <>
          {!result.data.items.length && <p role="status">No contributions match this page.</p>}
          {result.data.items.map((row) => (
            <article key={row.id} className={panel}>
              <h3 className="break-words text-lg font-semibold">
                Contribution {row.id} · {row.reference}
              </h3>
              <p className="text-xl text-primary">
                {money(row.amount, row.currency)} · {row.status}
              </p>
              <p>
                Payment date: {row.payment_date} · Method: {row.method} · Enrolment{" "}
                {row.enrolment_id}
              </p>
              {row.flags.map((f) => (
                <p key={f} className="text-sm">
                  Flag: {f}
                </p>
              ))}
              <p className="text-sm text-muted-foreground">
                Recorded savings separation: {row.policy.separation.replaceAll("_", " ")}
                {!row.policy.explicitly_configured
                  ? " (restrictive default; approval pending)"
                  : ""}
                . Later settings do not rewrite this payment.
              </p>
              {row.history.map((e) => (
                <div key={e.id} className="break-words border-l border-primary/30 pl-3 text-sm">
                  <p>
                    {e.action} · {e.outcome} · {e.actor} ·{" "}
                    {new Date(e.recorded_at).toLocaleString()}
                  </p>
                  <p>Evidence/reference: {e.evidence_reference}</p>
                  <p>{e.reason}</p>
                </div>
              ))}
              {row.ledger.map((e) => (
                <p key={e.id} className="text-sm">
                  Ledger {e.id}: {e.kind} · {money(e.amount, e.currency)}
                  {e.reverses_id ? ` · reverses ledger ${e.reverses_id}` : ""}
                </p>
              ))}
              {row.receipt_available ? (
                <Button variant="outline" onClick={() => void openReceipt(row.id)}>
                  View receipt {row.id}
                </Button>
              ) : (
                <p className="text-sm">
                  Not a confirmed receipt. This record does not increase confirmed savings.
                </p>
              )}
              {!member &&
                ["extra", "verify", "reconcile", "reverse"]
                  .filter((a) => has(a))
                  .map((action) => {
                    const outcomes =
                      action === "extra" &&
                      row.status === "Pending verification" &&
                      row.flags.some((f) => f.startsWith("Extra"))
                        ? ["Authorised"]
                        : action === "verify" && row.status === "Pending verification"
                          ? ["Verified", "Rejected"]
                          : action === "reconcile" &&
                              ["Verified", "Discrepancy"].includes(row.status)
                            ? ["Matched", "Discrepancy"]
                            : action === "reverse" && row.status === "Confirmed"
                              ? ["Reversed"]
                              : [];
                    return outcomes.length ? (
                      <form
                        key={action}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void save(`/api/savings/${row.id}/${action}`, {
                            request_key: crypto.randomUUID(),
                            base_event_id: row.base_event_id,
                            outcome: f.get("outcome"),
                            evidence_reference: f.get("evidence"),
                            reason: f.get("reason"),
                            ...(action === "reconcile"
                              ? {
                                  observed_amount: f.get("observed_amount"),
                                  observed_currency: f.get("observed_currency"),
                                  observed_reference: f.get("observed_reference"),
                                }
                              : {}),
                          });
                        }}
                      >
                        <fieldset
                          disabled={busy || !!pending}
                          className="space-y-3 border-t border-border pt-4"
                        >
                          <legend className="font-semibold capitalize">
                            {action} contribution {row.id}
                          </legend>
                          <label className="block">
                            Decision
                            <select
                              aria-label={`${action} decision ${row.id}`}
                              name="outcome"
                              className={input}
                              required
                            >
                              <option value="">Choose explicit action</option>
                              {outcomes.map((o) => (
                                <option key={o}>{o}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            Evidence or reconciliation reference
                            <input name="evidence" className={input} required maxLength={200} />
                          </label>
                          <label className="block">
                            Reason
                            <textarea name="reason" className={input} required maxLength={2000} />
                          </label>
                          {action === "reconcile" && (
                            <>
                              <label className="block">
                                Observed payment amount
                                <input
                                  name="observed_amount"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className={input}
                                  required
                                />
                              </label>
                              <label className="block">
                                Observed currency
                                <select name="observed_currency" className={input} required>
                                  <option value="">Choose currency</option>
                                  <option>USD</option>
                                  <option value="ZWG">ZiG</option>
                                </select>
                              </label>
                              <label className="block">
                                Observed payment reference
                                <input
                                  name="observed_reference"
                                  className={input}
                                  required
                                  maxLength={100}
                                />
                              </label>
                            </>
                          )}
                          <Button type="submit">
                            Record {action} decision {row.id}
                          </Button>
                        </fieldset>
                      </form>
                    ) : null;
                  })}
            </article>
          ))}
          <nav aria-label="Contribution pages" className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - 10))}
            >
              Previous
            </Button>
            <span>
              {result.data.total} records · Page {Math.floor(skip / 10) + 1}
            </span>
            <Button
              variant="outline"
              disabled={skip + 10 >= result.data.total}
              onClick={() => setSkip(skip + 10)}
            >
              Next
            </Button>
          </nav>
        </>
      )}
      {receipt && (
        <section aria-label="Contribution receipt" className={panel}>
          <h2 className="text-xl font-semibold">{receipt.notice}</h2>
          <p className="break-words">Reference: {receipt.contribution.reference}</p>
          <p>
            {money(receipt.contribution.amount, receipt.contribution.currency)} ·{" "}
            {receipt.contribution.status}
          </p>
          <p>Payment date: {receipt.contribution.payment_date}</p>
          <p>
            Confirmation is retained in the linked ledger and review history above. Reversed
            receipts remain historical evidence.
          </p>
        </section>
      )}
      {!member && <LegacyRecords />}
      <Button variant="outline" onClick={result.reload}>
        Refresh savings
      </Button>
      {member && (
        <Link
          to="/portal/$role/$screen"
          params={{ role: "member", screen: "fees" }}
          className="block text-primary underline"
        >
          View separate fees
        </Link>
      )}
    </div>
  );
}
function RecordForm({
  disabled,
  save,
}: {
  disabled: boolean;
  save: (path: string, body: object) => Promise<boolean>;
}) {
  const [q, setQ] = useState("");
  const result = useRecords<{
    items: {
      id: number;
      member_number: string;
      name: string;
      currency: string;
      weekly_target: string;
      start_date: string;
      end_date: string;
    }[];
    total: number;
  }>(`/api/savings/enrolments?q=${encodeURIComponent(q)}&limit=20`);
  return (
    <section className={panel}>
      <h2 className="text-lg font-semibold">Record an office contribution</h2>
      <label className="block">
        Find enrolment by member number
        <input className={input} value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
      </label>
      {result.error ? (
        <Feedback {...result} />
      ) : !result.data ? (
        <p role="status">Loading active enrolments…</p>
      ) : !result.data.items.length ? (
        <p>
          No active enrolments found. Do not record against an unapproved interest or plan
          application.
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const enrolment = result.data!.items.find((r) => r.id === Number(f.get("enrolment")));
            if (!enrolment) return;
            if (
              await save("/api/savings", {
                request_key: crypto.randomUUID(),
                enrolment_id: enrolment.id,
                currency: enrolment.currency,
                amount: f.get("amount"),
                payment_date: f.get("date"),
                method: f.get("method"),
                reference: f.get("reference"),
              })
            )
              form.reset();
          }}
        >
          <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <legend className="sr-only">Office payment details</legend>
            <label>
              Active enrolment
              <select aria-label="Active enrolment" name="enrolment" className={input} required>
                <option value="">Select member and enrolment</option>
                {result.data.items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.member_number} · {r.name} · {r.currency} · enrolment {r.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount in enrolment currency
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                className={input}
                required
              />
            </label>
            <label>
              Payment date
              <input name="date" type="date" className={input} required />
            </label>
            <label>
              Payment method
              <input name="method" className={input} required maxLength={100} />
            </label>
            <label>
              Receipt/payment reference
              <input name="reference" className={input} required maxLength={100} />
            </label>
            <div className="self-end">
              <Button>Record pending contribution</Button>
            </div>
          </fieldset>
          <p className="mt-4 text-sm text-muted-foreground">
            No conversion. Outside-date payments are flagged and cannot be confirmed. Amounts above
            the remaining weekly target require separate authorised extra-contribution processing.
            Recording never credits savings.
          </p>
        </form>
      )}
    </section>
  );
}
function LegacyRecords() {
  const result = useRecords<{
    items: {
      id: number;
      reference: string;
      amount: string;
      currency: string;
      status: string;
      notice: string;
    }[];
    total: number;
  }>("/api/savings/legacy?limit=20");
  return (
    <section className={panel}>
      <h2 className="font-semibold">Historical contributions — explicit reconciliation required</h2>
      {result.error ? (
        <Feedback {...result} />
      ) : !result.data ? (
        <p>Loading historical records…</p>
      ) : (
        <>
          <p>{result.data.total} records. No historical row is automatically credited.</p>
          {result.data.items.map((r) => (
            <p key={r.id} className="break-words">
              {r.reference} · {money(r.amount, r.currency)} · {r.status}. {r.notice}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
