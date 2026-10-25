import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { PublishedContent } from "@/components/site/PublishedContent";
import { SupportCentre } from "@/components/portal/SupportCentre";
import { ContentManagement } from "@/components/portal/ContentManagement";
import { handleAuthentication } from "@/lib/auth-server";
import { officeInstant } from "@/lib/content-support-api";
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ identity: { permissions: ["support:own", "content:read", "content:draft"] } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows honest empty public data and retries failed reads", async () => {
  let failed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      failed
        ? Response.json({ error: "Temporarily unavailable" }, { status: 503 })
        : Response.json({ items: [], total: 0 }),
    ),
  );
  render(<PublishedContent kind="event" emptyTitle="No approved events" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Temporarily unavailable");
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry approved information" }));
  expect(await screen.findByText("No approved events")).toBeVisible();
});
it("renders plaintext without interpreting markup and uses controlled public media", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          total: 1,
          items: [
            {
              item_id: 1,
              kind: "announcement",
              version: 1,
              fields: { title: "TEST ONLY", body: "<script>unsafe()</script>" },
              media: { id: 3, alt: "TEST ONLY illustration" },
            },
          ],
        }),
      ),
  );
  const { container } = render(<PublishedContent kind="announcement" emptyTitle="Empty" />);
  expect(await screen.findByText("<script>unsafe()</script>")).toBeVisible();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByAltText("TEST ONLY illustration")).toHaveAttribute(
    "src",
    "/api/public/content/media/3",
  );
});
it("preserves support form and request identity on failed/lost-response retry", async () => {
  let fail = true;
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_p, init) => {
      if (!init?.method) return Response.json({ items: [], total: 0 });
      bodies.push(init.body);
      return fail
        ? Response.json({ error: "Retry safely" }, { status: 503 })
        : Response.json({
            id: 1,
            number: "SUP-TEST",
            subject: "TEST ONLY",
            status: "Open",
            revision: 1,
            messages: [],
            history: [],
          });
    }),
  );
  render(<SupportCentre member />);
  await screen.findByText("No support tickets match this page.");
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "TEST ONLY" } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Synthetic help" } });
  fireEvent.click(screen.getByRole("button", { name: "Create support ticket" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Retry safely");
  expect(screen.getByLabelText("Message")).toHaveValue("Synthetic help");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Create support ticket" }));
  await screen.findByText("Saved. No response deadline is promised.");
  expect(bodies[0]).toBe(bodies[1]);
});
it("saves incomplete private drafts without claiming publication", async () => {
  const fetcher = vi.fn(async (_p, init) =>
    init?.method
      ? Response.json({
          id: 1,
          item_id: 1,
          kind: "announcement",
          version: 1,
          latest_version: 1,
          state: "Draft",
          base_event: 0,
          fields: { title: "", body: "" },
          missing: ["Title is required."],
          author: "test@example.test",
          recorded_at: "2026-10-23T10:00:00Z",
          history: [],
        })
      : Response.json({ items: [], total: 0, scanning_available: false }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<ContentManagement />);
  await screen.findByText("No content matches this page.");
  fireEvent.click(screen.getByRole("button", { name: "Save private draft" }));
  expect(
    await screen.findByText("Private draft saved. The public version has not changed."),
  ).toBeVisible();
  expect(screen.getByText("Title is required.")).toBeVisible();
  expect(
    screen.getByText("Image uploads unavailable: scanning is not configured or available."),
  ).toBeVisible();
  expect(screen.queryByRole("option", { name: "Publish approved version" })).toBeNull();
});
it("uses explicit Harare time, including invalid calendar rejection", () => {
  expect(officeInstant("2026-10-23T12:15")).toBe("2026-10-23T10:15:00.000Z");
  expect(() => officeInstant("2026-02-30T12:00")).toThrow();
});
it("limits private bridges, origins and caller-supplied ownership", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [] }));
  vi.stubGlobal("fetch", fetcher);
  const origin = "http://localhost:3000";
  const cookie = "isave_session=" + "x".repeat(43);
  expect((await handleAuthentication(new Request(origin + "/api/support")))?.status).toBe(401);
  expect(
    (
      await handleAuthentication(
        new Request(origin + "/api/support?user_id=2", { headers: { cookie } }),
      )
    )?.status,
  ).toBe(400);
  expect(
    (
      await handleAuthentication(
        new Request(origin + "/api/content/private", { headers: { cookie } }),
      )
    )?.status,
  ).toBe(404);
  expect(
    (
      await handleAuthentication(
        new Request(origin + "/api/content", {
          method: "POST",
          headers: { cookie, origin: "https://attacker.test", "X-Isave-Request": "1" },
          body: "{}",
        }),
      )
    )?.status,
  ).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
  const r = await handleAuthentication(
    new Request(origin + "/api/public/content?kind=faq", {
      headers: { cookie, Authorization: "spoof" },
    }),
  );
  expect(r?.status).toBe(200);
  expect(fetcher.mock.lastCall?.[1].headers).toEqual({});
});
