import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Feedback, useRecords } from "./AdminDataScreens";
import { encodeEvidence, evidenceConsentVersion } from "@/components/auth/RegistrationEvidence";

type Evidence = {
  id: number;
  kind: string;
  status: string;
  superseded: boolean;
  size: number;
  recorded_at: string;
  submitted_by: string | null;
  history: { id: number; outcome: string; reason: string; reviewer: string; recorded_at: string }[];
};
type Documents = {
  national_id: string | null;
  income_source: string | null;
  retention_notice: string;
  missing: string[];
  approval_blockers: string[];
  items: Evidence[];
  consent: { text: string | null; version: string | null; at: string | null } | null;
};
const field = "mt-2 w-full min-w-0 rounded-md border border-input bg-background px-3 py-3 text-sm";

export function ApplicationDocuments({ id, onChange }: { id: number; onChange: () => void }) {
  const auth = useAuth(),
    has = (code: string) => !!auth.identity?.permissions.includes(code);
  return has("documents:view") ? (
    <DocumentsContent id={id} onChange={onChange} />
  ) : (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-xl font-semibold">Documents</h2>
      <p className="mt-3 text-sm">
        Private evidence requires separate document-view permission. No evidence is displayed.
      </p>
    </section>
  );
}

function DocumentsContent({ id, onChange }: { id: number; onChange: () => void }) {
  const auth = useAuth(),
    has = (code: string) => !!auth.identity?.permissions.includes(code);
  const result = useRecords<Documents>(`/api/application-documents/${id}`);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  // One exact pending request is kept across uncertain responses.
  const [pending, setPending] = useState<{ path: string; body: object } | null>(null);
  async function save(path: string, body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    const request = pending ?? { path, body };
    setPending(request);
    try {
      const response = await fetch(request.path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Isave-Request": "1" },
        body: JSON.stringify(request.body),
      });
      if (response.status === 401) await auth.refresh();
      const data = await response.json();
      if (!response.ok) {
        if ([400, 403, 409].includes(response.status)) setPending(null);
        throw Error(data.error ?? "Action could not be confirmed.");
      }
      setPending(null);
      setNotice(
        "Evidence action recorded. Review the refreshed status; no membership or payment action was performed.",
      );
      result.reload();
      onChange();
    } catch (e) {
      setError(
        e instanceof Error && !(e instanceof TypeError)
          ? e.message
          : "Action could not be confirmed. Retry the same request.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (result.error) return <Feedback {...result} />;
  if (!result.data) return <p role="status">Loading private documents…</p>;
  const data = result.data;
  return (
    <section
      id="application-documents"
      aria-label="Documents"
      className="space-y-5 rounded-xl border border-primary/25 bg-card p-5 sm:p-8"
    >
      <h2 className="text-xl font-semibold">Documents</h2>
      <p className="text-sm text-muted-foreground">
        Private evidence review is separate from payment verification and membership approval.
        Replacements preserve originals and require a new review.
      </p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">National ID number</dt>
          <dd className="break-all">{data.national_id ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Income source</dt>
          <dd>{data.income_source?.replace("_", " ") ?? "Not recorded"}</dd>
        </div>
      </dl>
      {data.consent?.text && (
        <details>
          <summary className="cursor-pointer text-sm text-primary">
            Recorded evidence consent
          </summary>
          <p className="mt-2 text-sm">{data.consent.text}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.consent.version} · {data.consent.at && new Date(data.consent.at).toLocaleString()}
          </p>
        </details>
      )}
      <p className="text-xs text-muted-foreground">{data.retention_notice}</p>
      {data.missing.length > 0 && (
        <p className="text-sm">
          Missing evidence: {data.missing.map((v) => v.replace("_", " ")).join(", ")}. The
          application’s snapshotted requirements determine approval blockers.
        </p>
      )}
      {data.approval_blockers.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {data.approval_blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {data.items.length === 0 ? (
        <p role="status">
          No evidence recorded. Historical applications have not been marked verified.
        </p>
      ) : (
        data.items.map((item) => (
          <article key={item.id} className="min-w-0 space-y-3 rounded-lg border border-border p-4">
            <h3 className="font-semibold">
              {item.kind.replace("_", " ")} — {item.status}
              {item.superseded ? " · Replaced (history retained)" : ""}
            </h3>
            <p className="text-xs text-muted-foreground">
              Recorded {new Date(item.recorded_at).toLocaleString()} ·{" "}
              {item.submitted_by ?? "Public applicant"} · {item.size} bytes
            </p>
            <a
              href={`/api/application-documents/${id}/${item.id}/download`}
              className="section-link"
              download
            >
              Download private evidence {item.id}
            </a>
            {item.history.map((h) => (
              <div key={h.id} className="break-words border-l border-primary/30 pl-3 text-sm">
                <p>
                  {h.outcome} · {h.reviewer} · {new Date(h.recorded_at).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{h.reason}</p>
              </div>
            ))}
            {has("documents:review") && !item.superseded && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void save(`/api/application-documents/${id}/${item.id}/review`, {
                    request_key: crypto.randomUUID(),
                    base_review_id: item.history.at(-1)?.id ?? 0,
                    outcome: f.get("outcome"),
                    reason: f.get("reason"),
                  });
                }}
              >
                <fieldset disabled={busy || !!pending} className="space-y-3">
                  <legend className="text-sm font-semibold">Review evidence {item.id}</legend>
                  <label className="block text-sm">
                    Outcome
                    <select name="outcome" className={field}>
                      <option>Accepted</option>
                      <option>Rejected</option>
                      <option>Further information requested</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    Review reason
                    <textarea name="reason" required maxLength={2000} className={field} />
                  </label>
                  <Button type="submit">Record document review</Button>
                </fieldset>
              </form>
            )}
          </article>
        ))
      )}
      {has("documents:replace") && has("applications:assist") && (
        <form
          className="space-y-3 border-t border-border pt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const values = new FormData(form);
            const file = values.get("file");
            if (!(file instanceof File)) return;
            setError("");
            try {
              const kind = String(values.get("kind"));
              const current = data.items.find((i) => i.kind === kind && !i.superseded);
              const evidence = await encodeEvidence(file, kind);
              await save(`/api/application-documents/${id}/replace`, {
                request_key: crypto.randomUUID(),
                replaces_id: current?.id ?? null,
                evidence,
                applicant_authorized: values.has("consent"),
                consent_version: evidenceConsentVersion,
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "File could not be read.");
            }
          }}
        >
          <fieldset disabled={busy || !!pending} className="space-y-3">
            <legend className="font-semibold">Submit additional or replacement evidence</legend>
            <label className="block text-sm">
              Evidence type
              <select name="kind" className={field}>
                <option value="residence">Proof of residence</option>
                <option value="income">Income evidence</option>
                <option value="self_employed">Alternative self-employment evidence</option>
              </select>
            </label>
            <label className="block text-sm">
              Private image (PNG/JPEG, maximum 2 MiB)
              <input
                name="file"
                type="file"
                accept="image/png,image/jpeg"
                required
                className={field}
              />
            </label>
            <label className="flex gap-3 text-sm">
              <input
                name="consent"
                type="checkbox"
                required
                className="mt-1 h-5 w-5 shrink-0 accent-primary"
              />
              The applicant authorises me to submit this evidence for private membership review. I
              have explained the evidence consent and confirmed the details with them.
            </label>
            <Button type="submit">Submit evidence for review</Button>
          </fieldset>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {pending && (
        <Button disabled={busy} onClick={() => void save(pending.path, pending.body)}>
          Retry same evidence action
        </Button>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setPending(null);
          result.reload();
        }}
      >
        Refresh document status
      </Button>
    </section>
  );
}
