import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Campaigns, MarketingPreferences } from "@/components/portal/Campaigns";
import { UnsubscribePage } from "@/routes/unsubscribe";
import { handleAuthentication } from "@/lib/auth-server";
const state = vi.hoisted(() => ({ permissions: ["marketing:own"] }));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ identity: { permissions: state.permissions } }),
}));
vi.mock("@/components/site/PublicLayout", () => ({
  PublicLayout: ({ children }: any) => <div>{children}</div>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  state.permissions = ["marketing:own"];
  history.replaceState(null, "", "/");
});
const wording =
  "I agree to receive optional announcement and event emails. Essential messages are separate.";
const preference = {
  enabled: false,
  revision: 0,
  version: "campaign-consent-v1",
  wording,
  history: [],
};
it("does not load campaigns or recipients for Members", () => {
  const f = vi.fn();
  vi.stubGlobal("fetch", f);
  render(<Campaigns />);
  expect(screen.getByRole("alert")).toHaveTextContent("Campaign read permission");
  expect(f).not.toHaveBeenCalled();
});
it("defaults to no marketing consent and preserves the same safe retry", async () => {
  let fail = true;
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_p, init) => {
      if (!init?.method) return Response.json(preference);
      bodies.push(init.body);
      return fail
        ? Response.json({ error: "Retry safely" }, { status: 503 })
        : Response.json({ ...preference, enabled: true, revision: 1 });
    }),
  );
  render(<MarketingPreferences />);
  const box = await screen.findByRole("checkbox");
  expect(box).not.toBeChecked();
  fireEvent.click(box);
  fireEvent.click(screen.getByRole("button", { name: "Save optional-email preference" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Retry safely");
  expect(box).toBeChecked();
  expect(screen.queryByText("Your optional-email preference is saved.")).toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Save optional-email preference" }));
  expect(await screen.findByText("Your optional-email preference is saved.")).toBeVisible();
  expect(bodies[0]).toBe(bodies[1]);
});
it("opening unsubscribe only displays unticked confirmation and removes the fragment", async () => {
  history.replaceState(null, "", "/unsubscribe#token=synthetic-private-input");
  const f = vi.fn().mockResolvedValue(Response.json({ message: "Generic acknowledgement" }));
  vi.stubGlobal("fetch", f);
  render(<UnsubscribePage />);
  await waitFor(() => expect(location.hash).toBe(""));
  expect(f).not.toHaveBeenCalled();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Confirm unsubscribe" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Your request has been received");
  expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({
    token: "synthetic-private-input",
    confirm: true,
  });
  expect(screen.queryByText(/@example/)).toBeNull();
});
it("requires explicit saved preview and unticked queue confirmation", async () => {
  state.permissions = ["campaigns:read", "campaigns:send"];
  const c = {
    id: 7,
    version: 1,
    state: "Approved",
    fields: {
      subject: "TEST ONLY",
      message: "Synthetic",
      audience: "active_opted_in_members",
      scheduled_at: null,
    },
    content_version_id: 3,
    base_event: 2,
    counts: {},
    history: [],
    versions: [],
  };
  const p = {
    subject: "TEST ONLY",
    message: "Synthetic",
    linked_content_version_id: 3,
    linked_content: { fields: { title: "Approved update" }, version: 1 },
    public_url: "http://localhost:3000/updates/2/1",
    audience: "Active opted-in Members",
    eligible_count: 1,
    scheduled_at: null,
    preview_digest: "synthetic-digest",
    missing: [],
    delivery_available: true,
    delivery_mode: "Local Mailpit capture only",
    production_blockers: ["Approved provider"],
  };
  const f = vi.fn(async (path, init?: RequestInit) =>
    Response.json(
      String(path).endsWith("/content")
        ? { items: [] }
        : String(path).endsWith("/preview")
          ? p
          : { items: [c], total: 1 },
    ),
  );
  vi.stubGlobal("fetch", f);
  render(<Campaigns />);
  fireEvent.click(await screen.findByRole("button", { name: /Campaign 7/ }));
  fireEvent.change(screen.getByLabelText(/Explicit campaign action/), {
    target: { value: "queue" },
  });
  expect(screen.getByRole("button", { name: "Record campaign action" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Load saved publication and audience preview" }),
  );
  expect(await screen.findByText("Currently eligible recipients: 1")).toBeVisible();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("link", { name: "Open exact public version" })).toHaveAttribute(
    "href",
    "http://localhost:3000/updates/2/1",
  );
  expect(f.mock.calls.every((c) => !c[1]?.method)).toBe(true);
});
it("protects private bridges and explicit anonymous unsubscribe", async () => {
  const f = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", f);
  const origin = "http://localhost:3000",
    cookie = "isave_session=" + "x".repeat(43);
  expect((await handleAuthentication(new Request(origin + "/api/campaigns")))?.status).toBe(401);
  expect(
    (
      await handleAuthentication(
        new Request(origin + "/api/campaigns/1/recipients?email=someone", { headers: { cookie } }),
      )
    )?.status,
  ).toBe(400);
  expect(
    (await handleAuthentication(new Request(origin + "/api/campaign-unsubscribe")))?.status,
  ).toBe(405);
  expect(
    (
      await handleAuthentication(
        new Request(origin + "/api/campaign-unsubscribe", {
          method: "POST",
          headers: { origin: "https://attacker.test", "X-Isave-Request": "1" },
          body: "{}",
        }),
      )
    )?.status,
  ).toBe(403);
  expect(f).not.toHaveBeenCalled();
  const r = await handleAuthentication(
    new Request(origin + "/api/campaign-unsubscribe", {
      method: "POST",
      headers: { origin, "X-Isave-Request": "1", "Content-Type": "application/json", cookie },
      body: JSON.stringify({ token: "synthetic-input", confirm: true }),
    }),
  );
  expect(r?.status).toBe(200);
  expect(f.mock.lastCall![1].headers).toEqual({ "Content-Type": "application/json" });
});
