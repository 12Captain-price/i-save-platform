import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Feedback, useRecords } from "./AdminDataScreens";
import { PlanApplicationRecord, type PlanRequest } from "./MemberPlans";

export function PlanApplicationReview() {
  const auth = useAuth();
  return auth.identity?.permissions.includes("plan-applications:review") ? (
    <ReviewContent />
  ) : (
    <p role="alert">Separate plan-application review permission is required.</p>
  );
}
function ReviewContent() {
  const auth = useAuth();
  const [query, setQuery] = useState(""),
    [q, setQ] = useState(""),
    [skip, setSkip] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const result = useRecords<{ items: PlanRequest[]; total: number }>(
    `/api/review/plan-applications?q=${encodeURIComponent(q)}&skip=${skip}&limit=10`,
  );
  const [pending, setPending] = useState<{ path: string; body: object } | null>(null);
  async function act(path: string, body: object) {
    const req = pending ?? { path, body };
    setPending(req);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(req.path, {
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
      setNotice("Plan action recorded. No payment or savings entry was created.");
      result.reload();
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
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Membership, category interest, plan application review and enrolment activation are
        separate. Activation starts eight calendar months; it creates no money movement.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSkip(0);
          setQ(query);
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          Search member number, name or status
          <input
            className="mt-2 block w-full rounded-md border border-input bg-background p-3"
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button type="submit">Search plan applications</Button>
      </form>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <Button disabled={busy} onClick={() => void act(pending.path, pending.body)}>
          Retry same plan review action
        </Button>
      )}
      {result.error ? (
        <Feedback {...result} />
      ) : !result.data ? (
        <p role="status">Loading plan applications…</p>
      ) : (
        <>
          {result.data.items.length === 0 ? (
            <p role="status">No plan applications match this search.</p>
          ) : (
            result.data.items.map((record) => (
              <section key={record.id} className="space-y-4">
                <h2 className="break-words text-xl font-semibold">
                  {record.member_name} · {record.member_number}
                </h2>
                <PlanApplicationRecord record={record} />
                {record.status === "Pending" && (
                  <form
                    className="space-y-3 rounded-xl border border-primary/25 bg-card p-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act(`/api/review/plan-applications/${record.id}/review`, {
                        base_status: record.status,
                        outcome: f.get("outcome"),
                        reason: f.get("reason"),
                      });
                    }}
                  >
                    <fieldset disabled={busy || !!pending} className="space-y-3">
                      <legend className="font-semibold">Plan application decision</legend>
                      <label className="block text-sm">
                        Decision
                        <select
                          aria-label="Decision"
                          required
                          name="outcome"
                          className="mt-2 block w-full rounded-md border border-input bg-background p-3"
                        >
                          <option value="">Choose a decision</option>
                          <option>Approved</option>
                          <option>Rejected</option>
                        </select>
                      </label>
                      <label className="block text-sm">
                        Reason
                        <textarea
                          name="reason"
                          required
                          maxLength={2000}
                          className="mt-2 block w-full rounded-md border border-input bg-background p-3"
                        />
                      </label>
                      <Button type="submit">Record plan decision</Button>
                    </fieldset>
                  </form>
                )}
                {record.status === "Approved" &&
                  auth.identity?.permissions.includes("enrolments:activate") && (
                    <Button
                      disabled={busy || !!pending}
                      onClick={() =>
                        void act(`/api/review/plan-applications/${record.id}/activate`, {})
                      }
                    >
                      Activate enrolment {record.id}
                    </Button>
                  )}
              </section>
            ))
          )}
          <nav aria-label="Plan application pages" className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={!skip}
              onClick={() => setSkip(Math.max(0, skip - 10))}
            >
              Previous
            </Button>
            <span>
              {result.data.total} applications · Page {skip / 10 + 1}
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
    </div>
  );
}
