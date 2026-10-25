import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  contentSupportApi as requestApi,
  harareDate,
  officeInstant,
} from "@/lib/content-support-api";

type Terms = {
  evidence_days: number | null;
  identity_days: number | null;
  backup_interval_hours: number | null;
};
type Preview = {
  policy_version: number;
  evidence_ids: number[];
  identity_application_ids: number[];
  preview_digest: string;
  execution_available: boolean;
  notice: string;
};
type Status = {
  active_version: number;
  active_terms: Terms;
  head_version: number;
  scopes: Record<keyof Terms, string>;
  policies: { id: number; terms: Terms; actor: string; at: string }[];
  history: {
    id: number;
    action: string;
    target: string;
    actor: string;
    at: string;
    details: Record<string, unknown>;
  }[];
  holds: Record<string, { event_id: number; enabled: boolean; reason: string }>;
  scanner: { available: boolean; message: string; mode: string };
  jobs: {
    id: number;
    kind: string;
    state: string;
    reason: string;
    backup_id: number | null;
    checksum: string | null;
    bytes: number | null;
    at: string;
    finished_at: string | null;
  }[];
  job_count: number;
  last_successful_backup: { id: number; at: string } | null;
  last_successful_recovery_test: { id: number; at: string } | null;
  backup_notice: string;
  unsupported: string[];
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  return requestApi(path, body) as Promise<T>;
}
const root = "/api/admin/operations";
const field = "mt-2 w-full rounded-md border border-border bg-background p-3";
const labels: Record<keyof Terms, string> = {
  evidence_days: "Superseded evidence retention (days)",
  identity_days: "Rejected-application national ID retention (days)",
  backup_interval_hours: "Local backup schedule interval (hours)",
};

export function DocumentOperations() {
  const auth = useAuth(),
    codes = auth.identity?.permissions ?? [];
  const can = (code: string) => codes.includes(code);
  const [data, setData] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [skip, setSkip] = useState(0);
  const [terms, setTerms] = useState<Record<keyof Terms, string>>({
      evidence_days: "",
      identity_days: "",
      backup_interval_hours: "",
    }),
    [draftKey, setDraftKey] = useState(crypto.randomUUID()),
    [base, setBase] = useState(0);
  const [effective, setEffective] = useState(""),
    [confirmPublish, setConfirmPublish] = useState(false),
    [publishKey, setPublishKey] = useState(crypto.randomUUID());
  const [appId, setAppId] = useState(""),
    [holdEnabled, setHoldEnabled] = useState(true),
    [reason, setReason] = useState(""),
    [holdKey, setHoldKey] = useState(crypto.randomUUID());
  const [preview, setPreview] = useState<Preview | null>(null),
    [eraseConfirm, setEraseConfirm] = useState(false),
    [eraseKey] = useState(crypto.randomUUID());
  const [jobKind, setJobKind] = useState("backup"),
    [backupId, setBackupId] = useState(""),
    [jobConfirm, setJobConfirm] = useState(false),
    [jobKey, setJobKey] = useState(crypto.randomUUID());
  async function load() {
    try {
      setError("");
      const result = await api<Status>(`${root}?skip=${skip}&limit=20`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load operations. Retry.");
    }
  }
  useEffect(() => {
    if (can("operations:read")) void load();
  }, [skip, auth.identity?.user?.id, can("operations:read")]);
  async function action(path: string, body: unknown, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(root + path, body);
      setNotice(message);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed; retry safely.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!can("operations:read"))
    return <p role="alert">You do not have permission to view document and recovery operations.</p>;
  return (
    <div className="space-y-8">
      {error && (
        <div>
          <p role="alert">{error}</p>
          <Button onClick={() => void load()}>Retry loading</Button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p role="status">Loading document operations…</p>
      ) : (
        <>
          <Button disabled={busy} onClick={() => void load()}>
            Refresh operations
          </Button>
          <section className="portal-panel space-y-3">
            <h2 className="text-xl font-semibold">Private upload scanning</h2>
            <p>{data.scanner.message}</p>
            <p>
              Mode: {data.scanner.mode}. Failed, timed-out or stale-signature scans do not save
              uploads. Existing evidence is not retrospectively marked verified.
            </p>
          </section>
          <section className="portal-panel space-y-4">
            <h2 className="text-xl font-semibold">Retention policy</h2>
            <p>
              Effective version: {data.active_version || "None — all new retention periods unset"}.
              Unset never causes deletion. Current evidence, accounts, financial records and
              audit/review history are excluded.
            </p>
            {can("retention:draft") && (
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const payload = Object.fromEntries(
                    Object.entries(terms).map(([k, v]) => [k, v === "" ? null : Number(v)]),
                  );
                  if (
                    await action(
                      "/draft",
                      { base_version: base, terms: payload, request_key: draftKey },
                      "Private draft saved; it has no effect before publication.",
                    )
                  ) {
                    setDraftKey(crypto.randomUUID());
                    setBase(data.head_version + 1);
                  }
                }}
              >
                <Button
                  type="button"
                  onClick={() => {
                    const t = data.policies[0]?.terms ?? data.active_terms;
                    setTerms(
                      Object.fromEntries(
                        Object.entries(t).map(([k, v]) => [k, v === null ? "" : String(v)]),
                      ) as Record<keyof Terms, string>,
                    );
                    setBase(data.head_version);
                    setDraftKey(crypto.randomUUID());
                  }}
                >
                  Load latest policy for editing
                </Button>
                {(Object.keys(labels) as (keyof Terms)[]).map((k) => (
                  <label className="block" key={k}>
                    {labels[k]}
                    <input
                      className={field}
                      aria-label={labels[k]}
                      type="number"
                      min="1"
                      max={k === "backup_interval_hours" ? 8760 : 36500}
                      value={terms[k]}
                      onChange={(e) => setTerms({ ...terms, [k]: e.target.value })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {data.scopes[k]} Blank means unset.
                    </span>
                  </label>
                ))}
                <Button disabled={busy}>Save private policy draft</Button>
              </form>
            )}
            {data.policies[0] && (
              <div className="space-y-3">
                <h3 className="font-semibold">
                  Publication preview — version {data.policies[0]!.id}
                </h3>
                {(Object.keys(labels) as (keyof Terms)[]).map((k) => (
                  <p key={k}>
                    {labels[k]}: {data.active_terms[k] ?? "Unset"} →{" "}
                    {data.policies[0]!.terms[k] ?? "Unset"}
                  </p>
                ))}
                <p>
                  Publication affects future eligibility previews and scheduled backup jobs. It does
                  not rewrite application requirements, accepted terms, payments or existing
                  archives. Destructive execution remains unavailable in normal services.
                </p>
                {can("retention:publish") && (
                  <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await action(
                          "/publish",
                          {
                            request_key: publishKey,
                            version: data.policies[0]!.id,
                            confirm: true,
                            effective_at: effective ? officeInstant(effective) : null,
                          },
                          "Policy publication recorded.",
                        )
                      ) {
                        setConfirmPublish(false);
                        setPublishKey(crypto.randomUUID());
                      }
                    }}
                  >
                    <label className="block">
                      Optional effective time — Harare (UTC+02:00)
                      <input
                        className={field}
                        type="datetime-local"
                        value={effective}
                        onChange={(e) => setEffective(e.target.value)}
                      />
                    </label>
                    <label className="flex gap-3">
                      <input
                        type="checkbox"
                        checked={confirmPublish}
                        onChange={(e) => setConfirmPublish(e.target.checked)}
                      />
                      I reviewed the scope, changes and effective time and authorise publication.
                    </label>
                    <Button disabled={busy || !confirmPublish}>Publish reviewed policy</Button>
                  </form>
                )}
              </div>
            )}
            <details>
              <summary>Saved policy version history</summary>
              {data.policies.map((p) => (
                <div className="my-3" key={p.id}>
                  <p>
                    Version {p.id} · {p.actor} · {harareDate(p.at)}
                  </p>
                  <ul>
                    {Object.entries(p.terms).map(([k, v]) => (
                      <li key={k}>
                        {labels[k as keyof Terms]}: {v ?? "Unset"}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          </section>
          <section className="portal-panel space-y-4">
            <h2 className="text-xl font-semibold">Legal holds and retention preview</h2>
            <p>
              A hold protects the application’s evidence and national ID from supported erasure.
              Holds and releases retain their reasons and history. This does not delete accounts or
              financial history.
            </p>
            {can("retention:hold") && (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await action(
                      "/hold",
                      {
                        request_key: holdKey,
                        application_id: Number(appId),
                        base_event: data.holds[appId]?.event_id ?? 0,
                        enabled: holdEnabled,
                        reason,
                      },
                      "Legal hold decision recorded.",
                    )
                  )
                    setHoldKey(crypto.randomUUID());
                }}
              >
                <label className="block">
                  Application ID
                  <input
                    className={field}
                    type="number"
                    min="1"
                    required
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                  />
                </label>
                <label className="block">
                  Decision
                  <select
                    className={field}
                    value={String(holdEnabled)}
                    onChange={(e) => setHoldEnabled(e.target.value === "true")}
                  >
                    <option value="true">Place legal hold</option>
                    <option value="false">Release legal hold</option>
                  </select>
                </label>
                <label className="block">
                  Reason
                  <textarea
                    className={field}
                    required
                    minLength={5}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <Button disabled={busy}>Record legal hold decision</Button>
              </form>
            )}
            <Button
              disabled={busy}
              onClick={async () => {
                try {
                  setPreview(await api<Preview>(root + "/retention-preview"));
                  setEraseConfirm(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Preview unavailable");
                }
              }}
            >
              Preview eligible records — no deletion
            </Button>
            {preview && (
              <div>
                <p>{preview.notice}</p>
                <p>
                  Eligible superseded evidence: {preview.evidence_ids.length}. Eligible national ID
                  fields: {preview.identity_application_ids.length}.
                </p>
                {preview.execution_available && can("retention:execute") && (
                  <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await action(
                          "/erase",
                          {
                            request_key: eraseKey,
                            preview_digest: preview.preview_digest,
                            reason,
                            confirm: true,
                          },
                          "Synthetic erasure recorded; history retained.",
                        )
                      ) {
                        setPreview(null);
                        setEraseConfirm(false);
                      }
                    }}
                  >
                    <label className="block">
                      Synthetic erasure reason
                      <textarea
                        className={field}
                        required
                        minLength={5}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <label className="flex gap-3">
                      <input
                        type="checkbox"
                        checked={eraseConfirm}
                        onChange={(e) => setEraseConfirm(e.target.checked)}
                      />
                      I authorise irreversible removal of eligible synthetic bytes/ID fields only.
                    </label>
                    <Button disabled={busy || !eraseConfirm}>Erase previewed synthetic data</Button>
                  </form>
                )}
              </div>
            )}
          </section>
          <section className="portal-panel space-y-4">
            <h2 className="text-xl font-semibold">Backup and recovery operations</h2>
            <p>{data.backup_notice}</p>
            <p>
              Last successful local backup:{" "}
              {data.last_successful_backup
                ? harareDate(data.last_successful_backup.at)
                : "None recorded"}
            </p>
            <p>
              Last successful isolated recovery test:{" "}
              {data.last_successful_recovery_test
                ? harareDate(data.last_successful_recovery_test.at)
                : "None recorded"}
            </p>
            <p>
              Failures and interrupted jobs require operator attention; a queued job is not a
              successful backup. No live restore action is provided.
            </p>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await action(
                    "/jobs",
                    {
                      request_key: jobKey,
                      kind: jobKind,
                      backup_id: jobKind === "backup" ? null : Number(backupId),
                      confirm: true,
                    },
                    "Operation queued; inspect its result before claiming protection.",
                  )
                ) {
                  setJobKey(crypto.randomUUID());
                  setJobConfirm(false);
                }
              }}
            >
              <label className="block">
                Operation
                <select
                  className={field}
                  value={jobKind}
                  onChange={(e) => {
                    setJobKind(e.target.value);
                    setJobConfirm(false);
                  }}
                >
                  <option value="backup">Encrypted local backup</option>
                  <option value="restore-test">Independent isolated restore test</option>
                </select>
              </label>
              {jobKind === "restore-test" && (
                <label className="block">
                  Successful backup ID
                  <input
                    className={field}
                    type="number"
                    min="1"
                    required
                    value={backupId}
                    onChange={(e) => setBackupId(e.target.value)}
                  />
                </label>
              )}
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={jobConfirm}
                  onChange={(e) => setJobConfirm(e.target.checked)}
                />
                I authorise this local operation; a restore test uses an isolated target only.
              </label>
              <Button
                disabled={
                  busy ||
                  !jobConfirm ||
                  !can(jobKind === "backup" ? "backups:run" : "backups:restore-test")
                }
              >
                Queue operation once
              </Button>
            </form>
            {data.jobs.length === 0 ? (
              <p>No backup operations recorded.</p>
            ) : (
              <ul className="space-y-4">
                {data.jobs.map((j) => (
                  <li key={j.id} className="break-words border-t border-border pt-3">
                    <h3 className="font-semibold">
                      Operation {j.id} · {j.kind} · {j.state}
                    </h3>
                    <p>{j.reason || "Awaiting worker"}</p>
                    <p>
                      {harareDate(j.at)}
                      {j.backup_id ? ` · Source backup ${j.backup_id}` : ""}
                    </p>
                    {j.checksum && (
                      <p className="break-all">
                        Encrypted archive SHA-256: {j.checksum} · {j.bytes} bytes
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3">
              <Button disabled={skip === 0 || busy} onClick={() => setSkip(Math.max(0, skip - 20))}>
                Previous operations
              </Button>
              <span>
                {data.job_count} operations · Page {skip / 20 + 1}
              </span>
              <Button
                disabled={skip + 20 >= data.job_count || busy}
                onClick={() => setSkip(skip + 20)}
              >
                Next operations
              </Button>
            </div>
          </section>
          <details className="portal-panel">
            <summary>Audit history</summary>
            <ul className="space-y-3">
              {data.history.map((h) => (
                <li key={h.id}>
                  {h.action} · {h.target} · {h.actor} · {harareDate(h.at)}
                  <p>{typeof h.details["reason"] === "string" ? h.details["reason"] : ""}</p>
                </li>
              ))}
            </ul>
          </details>
          <section className="portal-panel">
            <h2 className="text-xl font-semibold">Unavailable operations</h2>
            <ul>
              {data.unsupported.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
