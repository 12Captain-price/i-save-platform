import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { NotificationCentre, StaffAdministration } from "@/components/portal/AccountAdministration";
import { handleAuthentication } from "@/lib/auth-server";
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ identity: { workspace: "member", permissions: [] } }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("denies staff administration to members without requests", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<StaffAdministration />);
  expect(screen.getByRole("alert")).toHaveTextContent("Security administrator");
  expect(fetcher).not.toHaveBeenCalled();
});
it("shows an empty notification centre", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ unread: 0, total: 0, items: [] })),
  );
  render(<NotificationCentre />);
  expect(await screen.findByText("No notifications yet.")).toBeVisible();
  expect(screen.getByRole("heading", { name: "0 unread notifications" })).toBeVisible();
});
it("preserves unread state on a failed update and supports retry", async () => {
  const data = {
    unread: 1,
    total: 1,
    items: [
      {
        id: 3,
        message: "Contribution status: Confirmed.",
        read: false,
        created_at: "2026-10-23T00:00:00Z",
        link: "/portal/member/contributions",
      },
    ],
  };
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_p, init) =>
      init?.method === "PUT"
        ? fail
          ? Response.json({ error: "Retry safely" }, { status: 503 })
          : Response.json({ read: true })
        : Response.json(data),
    ),
  );
  render(<NotificationCentre />);
  fireEvent.click(await screen.findByRole("button", { name: "Mark read" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Retry safely");
  expect(screen.getByRole("heading", { name: "1 unread notifications" })).toBeVisible();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Mark read" })).toBeEnabled());
});
it("protects staff and notification bridges against CSRF, anonymous access and arbitrary routes", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const token = "x".repeat(43);
  const request = (path: string, headers = {}) =>
    new Request("http://localhost:3000" + path, {
      method: "PUT",
      headers: { cookie: "isave_session=" + token, "Content-Type": "application/json", ...headers },
      body: '{"read":true}',
    });
  expect((await handleAuthentication(request("/api/notifications/1")))?.status).toBe(403);
  expect(
    (await handleAuthentication(new Request("http://localhost:3000/api/admin/staff")))?.status,
  ).toBe(401);
  expect((await handleAuthentication(request("/api/admin/staff/secrets")))?.status).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
});
