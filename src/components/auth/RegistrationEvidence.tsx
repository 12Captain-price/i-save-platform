import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Feedback, useRecords } from "@/components/portal/AdminDataScreens";

export type EvidenceRequirements = {
  scan_mode?:string;
  collection_available?:boolean;
  require_national_id: boolean;
  require_residence_evidence: boolean;
  require_income_evidence: boolean;
  require_evidence_acceptance: boolean;
  uploads_available: boolean;
  document_retention_days: number | null;
  consent_text: string;
  consent_version: string;
  purpose: string;
  production_notice: string;
};
export const evidenceConsentVersion = "registration-evidence-v1";
const field = "mt-2 w-full min-w-0 rounded-md border border-input bg-background px-3 py-3 text-sm";

export async function encodeEvidence(file: File, kind: string) {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 2 * 1024 * 1024 || !file.size)
    throw new Error("Use PNG or JPEG images no larger than 2 MiB each.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]!);
    reader.onerror = () =>
      reject(new Error("The image could not be read. Select it again and retry."));
    reader.readAsDataURL(file);
  });
  return { kind, filename: file.name, content_type: file.type, data };
}

export async function evidencePayload(form: HTMLFormElement) {
  const fields = new FormData(form);
  const evidence = [];
  for (const kind of ["residence", "income", "self_employed"]) {
    const file = fields.get("document_" + kind);
    if (file instanceof File && file.size) evidence.push(await encodeEvidence(file, kind));
  }
  return {
    national_id: fields.get("national_id") || null,
    income_source: fields.get("income_source") || null,
    evidence,
    evidence_consent: fields.has("evidence_consent"),
    evidence_consent_version: fields.has("evidence_consent") ? evidenceConsentVersion : null,
  };
}

export function RegistrationEvidence({ disabled = false }: { disabled?: boolean }) {
  const result = useRecords<EvidenceRequirements>("/api/public/registration-requirements");
  const [source, setSource] = useState(""),
    [sensitive, setSensitive] = useState(false);
  const r = result.data;
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-4 rounded-lg border border-primary/25 p-4 sm:p-5"
    >
      <legend className="px-2 font-semibold">Identity, residence and income</legend>
      {result.error ? (
        <Feedback {...result} />
      ) : !r ? (
        <p role="status">Loading document requirements…</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {r.purpose} Uploads are private; only authorised reviewers can access them. Do not email
            identity documents.
          </p>
          <label className="block text-sm">
            National ID number
            {r.require_national_id ? " (required)" : " (optional under current requirements)"}
            <input
              name="national_id"
              disabled={r.collection_available===false}
              autoComplete="off"
              className={field}
              maxLength={100}
              required={r.require_national_id}
              onChange={(e) => setSensitive(!!e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Source of income{r.require_income_evidence ? " (required)" : " (optional)"}
            <select
              name="income_source"
              disabled={r.collection_available===false}
              className={field}
              value={source}
              required={r.require_income_evidence}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Select if applicable</option>
              <option value="employed">Employed</option>
              <option value="self_employed">Self-employed</option>
              <option value="pension">Pension</option>
              <option value="other">Other income</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            PNG or JPEG images only, up to 2 MiB and 16 megapixels each. PDFs and office documents
            are not supported. Keep filenames simple. All files must pass validation and malware
            scanning.
          </p>
          {!r.uploads_available && (
            <p role="status" className="text-sm text-primary">
              Private uploads are currently unavailable. An operational scanner and approved collection configuration are required. Contact the office for guidance; no document has been uploaded.
            </p>
          )}
          {(["residence", source === "self_employed" ? "self_employed" : "income"] as const).map(
            (kind) => (
              <label key={kind} className="block text-sm">
                {kind === "residence"
                  ? "Proof of residence"
                  : kind === "self_employed"
                    ? "Alternative income evidence for self-employment"
                    : "Supporting income evidence"}
                {(kind === "residence" ? r.require_residence_evidence : r.require_income_evidence)
                  ? " (required)"
                  : " (optional)"}
                <input
                  name={"document_" + kind}
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={!r.uploads_available}
                  required={
                    kind === "residence" ? r.require_residence_evidence : r.require_income_evidence
                  }
                  className={field}
                  onChange={() => setSensitive(true)}
                />
              </label>
            ),
          )}
          <p className="text-xs text-muted-foreground">
            For self-employment, submit alternative evidence of your income source rather than
            employment documents. Income evidence does not establish future contribution
            consistency.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="evidence_consent"
              required={
                sensitive ||
                !!source ||
                r.require_national_id ||
                r.require_residence_evidence ||
                r.require_income_evidence
              }
              className="mt-1 h-5 w-5 shrink-0 accent-primary"
            />
            {r.consent_text}
          </label>
          <p className="text-xs text-muted-foreground">
            {r.document_retention_days === null
              ? "A retention period has not been approved; production retention and privacy operations remain outstanding."
              : `Recorded application collection policy: ${r.document_retention_days} days. Normal document deletion remains disabled; scoped operational retention is managed separately.`}
          </p>
        </>
      )}
      {r?.scan_mode==='synthetic-test-only'&&<p role="status" className="text-sm text-primary">Disposable test scanner: synthetic images only. Do not upload real identity or income documents.</p>}
    </fieldset>
  );
}
