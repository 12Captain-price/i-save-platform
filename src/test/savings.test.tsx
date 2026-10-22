import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { SavingsWorkspace, SavingsSummary } from "@/components/portal/SavingsWorkspace";
import { handleAuthentication } from "@/lib/auth-server";
const auth = vi.hoisted(() => ({ identity: { permissions: ["savings:own"] }, refresh: vi.fn() }));
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  auth.identity.permissions = ["savings:own"];
});
const summary = {
  available: true,
  confirmed: [],
  pending: [],
  legacy_requires_review: 0,
  message: "Fees are excluded. No currency conversion.",
};
const pending = {
  id: 1,
  enrolment_id: 2,
  amount: "10.00",
  currency: "USD",
  payment_date: "2026-10-22",
  method: "Cash",
  reference: "SYNTHETIC-REF",
  status: "Pending verification",
  flags: [],
  policy: { separation: "distinct_all", explicitly_configured: false },
  history: [],
  ledger: [],
  base_event_id: 0,
  receipt_available: false,
};
it("denies access without fetching financial records", () => {
  auth.identity.permissions = [];
  const f = vi.fn();
  vi.stubGlobal("fetch", f);
  render(<SavingsWorkspace member />);
  expect(screen.getByRole("alert")).toHaveTextContent("permission");
  expect(f).not.toHaveBeenCalled();
});
it("shows honest empty records and distinct currencies", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ items: [], total: 0, summary })),
  );
  render(<SavingsWorkspace member />);
  await screen.findByText("No contributions match this page.");
  expect(screen.getByText("No confirmed ledger credits recorded.")).toBeInTheDocument();
});
it("keeps pending funds separate and hides confirmed receipts", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          items: [pending],
          total: 1,
          summary: { ...summary, pending: [{ currency: "USD", amount: "10.00" }] },
        }),
      ),
  );
  render(<SavingsWorkspace member />);
  await screen.findByText(/Not a confirmed receipt/);
  expect(screen.queryByRole("button", { name: /View receipt/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Record pending/)).not.toBeInTheDocument();
});
it("shows signed per-currency ledger totals without a combined balance", () => {
  render(
    <SavingsSummary
      data={{
        ...summary,
        confirmed: [
          { currency: "USD", amount: "10.00" },
          { currency: "ZWG", amount: "340.00" },
        ],
        pending: [{ currency: "USD", amount: "5.00" }],
        legacy_requires_review: 1,
      }}
    />,
  );
  expect(screen.getByText("USD 10.00")).toBeInTheDocument();
  expect(screen.getByText("ZiG 340.00")).toBeInTheDocument();
  expect(screen.getByText(/historical contribution/)).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("350");
});
it("loads an owned confirmed receipt and retains reversal warning", async () => {
  const reversed = { ...pending, status: "Reversed", receipt_available: true };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async (path: string) =>
        Response.json(
          path.endsWith("/receipt")
            ? {
                contribution: reversed,
                notice: "Reversed receipt: historical confirmation retained",
              }
            : { items: [reversed], total: 1, summary },
        ),
      ),
  );
  render(<SavingsWorkspace member />);
  fireEvent.click(await screen.findByRole("button", { name: "View receipt 1" }));
  expect(await screen.findByRole("heading", { name: /Reversed receipt/ })).toBeInTheDocument();
});
it("handles service errors with a retry state", async () => {
  let count = 0;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async () =>
        ++count === 1
          ? new Response(null, { status: 503 })
          : Response.json({ items: [], total: 0, summary }),
      ),
  );
  render(<SavingsWorkspace member />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
  await screen.findByText("No contributions match this page.");
});
it("restricts the savings API bridge and derives authentication from its cookie", async () => {
  const f = vi.fn().mockResolvedValue(Response.json({ items: [] }));
  vi.stubGlobal("fetch", f);
  const token = "x".repeat(43);
  const req = (path: string, init: RequestInit = {}) =>
    new Request("http://localhost:3000" + path, init);
  const input = {
    method: "POST",
    headers: {
      cookie: `isave_session=${token}`,
      origin: "http://localhost:3000",
      "X-Isave-Request": "1",
      "Content-Type": "application/json",
      Authorization: "Bearer spoofed",
    },
    body: "{}",
  };
  expect((await handleAuthentication(req("/api/savings")))?.status).toBe(401);
  expect(
    (await handleAuthentication(req("/api/savings?member_id=9", { headers: input.headers })))
      ?.status,
  ).toBe(400);
  expect(
    (
      await handleAuthentication(
        req("/api/savings/1/reconcile", {
          ...input,
          headers: { ...input.headers, origin: "https://attacker.test" },
        }),
      )
    )?.status,
  ).toBe(403);
  expect((await handleAuthentication(req("/api/savings/1/delete", input)))?.status).toBe(404);
  expect(f).not.toHaveBeenCalled();
  expect((await handleAuthentication(req("/api/savings/1/reconcile", input)))?.status).toBe(200);
  expect(f.mock.lastCall![1].headers.Authorization).toBe("Bearer " + token);
});
