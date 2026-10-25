import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentOperations } from "@/components/portal/DocumentOperations";
import { handleAuthentication } from "@/lib/auth-server";

it("operations bridge rejects anonymous, cross-origin and unsupported live-restore requests", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  try {
    const origin = "http://127.0.0.1:13090";
    expect(
      (await handleAuthentication(new Request(origin + "/api/admin/operations")))?.status,
    ).toBe(401);
    expect(
      (
        await handleAuthentication(
          new Request(origin + "/api/admin/operations/jobs", {
            method: "POST",
            headers: {
              Cookie: "isave_session=" + "a".repeat(43),
              Origin: "https://untrusted.example",
              "X-Isave-Request": "1",
            },
          }),
        )
      )?.status,
    ).toBe(403);
    expect(
      (
        await handleAuthentication(
          new Request(origin + "/api/admin/operations/live-restore", {
            headers: { Cookie: "isave_session=" + "a".repeat(43) },
          }),
        )
      )?.status,
    ).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
const mocks = vi.hoisted(() => ({
  permissions: [
    "operations:read",
    "retention:draft",
    "retention:publish",
    "retention:hold",
    "backups:run",
    "backups:restore-test",
  ],
  api: vi.fn(),
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ identity: { permissions: mocks.permissions } }),
}));
vi.mock("@/lib/content-support-api", () => ({
  contentSupportApi: mocks.api,
  harareDate: (v: string) => v,
  officeInstant: (v: string) => v + ":00+02:00",
}));
const baseline = {
  active_version: 0,
  head_version: 0,
  active_terms: { evidence_days: null, identity_days: null, backup_interval_hours: null },
  scopes: {
    evidence_days: "Superseded evidence only",
    identity_days: "National ID only",
    backup_interval_hours: "Local scheduling only",
  },
  policies: [],
  history: [],
  holds: {},
  scanner: { available: false, mode: "unavailable", message: "Uploads are blocked." },
  jobs: [],
  job_count: 0,
  last_successful_backup: null,
  last_successful_recovery_test: null,
  backup_notice: "Encrypted local copies are not off-site protection.",
  unsupported: ["Live restore", "Normal deletion"],
};
beforeEach(() => {
  mocks.permissions = [
    "operations:read",
    "retention:draft",
    "retention:publish",
    "retention:hold",
    "backups:run",
    "backups:restore-test",
  ];
  mocks.api.mockReset();
  mocks.api.mockResolvedValue(baseline);
});
describe("private document operations", () => {
  it("denies access without calling the API", () => {
    mocks.permissions = [];
    render(<DocumentOperations />);
    expect(screen.getByRole("alert")).toHaveTextContent("permission");
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("shows unset safe states and never renders live restore or normal deletion actions", async () => {
    render(<DocumentOperations />);
    await screen.findByText("Uploads are blocked.");
    expect(screen.getByText("No backup operations recorded.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Erase/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue operation once" })).toBeDisabled();
  });
  it("saves explicit unset draft fields and keeps failures retryable with the same key", async () => {
    render(<DocumentOperations />);
    await screen.findByText("Uploads are blocked.");
    mocks.api.mockRejectedValueOnce(Error("Synthetic failure"));
    fireEvent.change(screen.getByLabelText("Superseded evidence retention (days)"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save private policy draft" }));
    await screen.findByRole("alert");
    const first = mocks.api.mock.calls.at(-1)?.[1];
    expect(first.terms).toEqual({
      evidence_days: 30,
      identity_days: null,
      backup_interval_hours: null,
    });
    mocks.api.mockResolvedValue(baseline);
    fireEvent.click(screen.getByRole("button", { name: "Save private policy draft" }));
    await waitFor(() =>
      expect(mocks.api.mock.calls.some((c) => c[1]?.request_key === first.request_key)).toBe(true),
    );
    expect(screen.getByLabelText("Superseded evidence retention (days)")).toHaveValue(30);
  });
  it("requires unticked explicit publication confirmation and shows impacts", async () => {
    mocks.api.mockResolvedValue({
      ...baseline,
      head_version: 1,
      policies: [
        {
          id: 1,
          terms: { evidence_days: 30, identity_days: null, backup_interval_hours: null },
          actor: "Synthetic Admin",
          at: "2026-10-25T12:00:00Z",
        },
      ],
    });
    render(<DocumentOperations />);
    const button = await screen.findByRole("button", { name: "Publish reviewed policy" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/does not rewrite application requirements/)).toBeVisible();
    fireEvent.click(screen.getByLabelText(/I reviewed the scope/));
    expect(button).toBeEnabled();
  });
  it("shows read-only retention preview without an erasure action in normal mode", async () => {
    render(<DocumentOperations />);
    await screen.findByText("Uploads are blocked.");
    mocks.api.mockResolvedValueOnce({
      policy_version: 0,
      evidence_ids: [],
      identity_application_ids: [],
      execution_available: false,
      notice: "Unset deletes nothing.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview eligible records — no deletion" }));
    await screen.findByText("Unset deletes nothing.");
    expect(
      screen.queryByRole("button", { name: "Erase previewed synthetic data" }),
    ).not.toBeInTheDocument();
  });
});
