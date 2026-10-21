import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
const password = randomBytes(24).toString("base64url");
const suffix = randomBytes(5).toString("hex");
const applicant = `settings-applicant-${suffix}@example.test`;
const acknowledgement =
  "I reviewed the application and the verified EUR 30 registration fee. Approval is separate from activation and savings-plan approval.";
const postHeaders = {
  Origin: process.env.ISAVE_E2E_ORIGIN ?? "http://127.0.0.1:13000",
  "X-Isave-Request": "1",
};
function python(code: string, input?: string) {
  return execFileSync(
    "docker",
    [
      "compose",
      "-p",
      process.env.ISAVE_E2E_PROJECT ?? "isave-browser-auth",
      "-f",
      "compose.auth-test.yaml",
      "exec",
      "-T",
      "backend",
      "python",
      "-c",
      `from app.database import engine; assert engine.url.database=='isave_test_browser'; ` + code,
    ],
    { input, encoding: "utf8", windowsHide: true },
  ).trim();
}
test.beforeAll(() => {
  python(
    `
import json,sys
from sqlalchemy.orm import Session
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.models.auth import UserPermission,LoginThrottle
from app.security.hashing import hash_password
secret=json.load(sys.stdin)['password']
with Session(engine) as db:
    if not db.query(User).count():bootstrap(db,'settings-bootstrap@example.test',secret)
    db.query(LoginThrottle).delete()
    for name,role in [('admin','administrator'),('writer','administrator'),('staff','staff'),('member','member')]:
        email='settings-browser-'+name+'@example.test'
        user=db.query(User).filter_by(email=email).one_or_none()
        if user:user.password_hash=hash_password(secret);continue
        user=User(email=email,role_id=db.query(Role).filter_by(name=role).one().id,is_active=True,password_hash=hash_password(secret));db.add(user);db.flush()
        if name=='writer':db.add(UserPermission(user_id=user.id,permission_id=db.query(Permission).filter_by(code='settings:publish').one().id,allowed=False))
    db.commit()
`,
    JSON.stringify({ password }),
  );
});
async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/[^/]+\/dashboard$/);
}
const saved = (page: Page) =>
  page.getByRole("heading", { name: /Publication preview · saved version/ });

test("settings drafts, safe retry, publication and real fee/activation/member consumption", async ({
  page,
}) => {
  test.setTimeout(120_000);
  expect((await page.request.get("/api/admin/organisation-settings")).status()).toBe(401);
  await login(page, "settings-browser-admin@example.test");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/portal/admin/settings", { waitUntil: "domcontentloaded" });
  await saved(page).waitFor();
  const before = await (await page.request.get("/api/public/contacts")).json();
  const preserved = python(
    `import hashlib,json; from sqlalchemy import text; c=engine.connect(); print(hashlib.sha256(json.dumps({n:sorted(json.dumps(list(r),default=str) for r in c.execute(text('SELECT * FROM '+n))) for n in ['application_registration_payments','subscriptions','membership_approvals']},sort_keys=True).encode()).hexdigest())`,
  );
  await page.getByLabel("Office address", { exact: true }).focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Synthetic published browser office");
  await page.getByLabel("Public email", { exact: true }).fill("settings-office@example.test");
  await page.getByLabel("Registration-fee amount", { exact: true }).fill("30.00");
  await page.getByLabel("Registration-fee currency", { exact: true }).fill("EUR");
  await page.getByLabel("Monthly subscription amount", { exact: true }).fill("7.50");
  await page.getByLabel("Subscription currency", { exact: true }).fill("EUR");
  await page.getByLabel("Subscription due day (optional)").fill("7");
  await page.getByLabel("Required reviewer acknowledgement wording").fill(acknowledgement);
  await expect(
    page.getByRole("button", {
      name: /Saved version already published|Publish saved settings version/,
    }),
  ).toBeDisabled();
  await page.route(
    "**/api/admin/organisation-settings",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save settings draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Request could not be confirmed");
  await expect(page.getByLabel("Office address", { exact: true })).toHaveValue(
    "Synthetic published browser office",
  );
  await page.getByRole("button", { name: "Retry same save" }).click();
  await expect(page.getByRole("button", { name: "Publish saved settings version" })).toBeEnabled();
  expect(await (await page.request.get("/api/public/contacts")).json()).toEqual(before);
  const preview = page.getByRole("region", { name: "Publication preview" });
  await expect(preview).toContainText("Future first payment recordings");
  await expect(preview).toContainText("Future activations");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Publish saved settings version" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved version published" }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/public/contacts")).json()).office).toBe(
    "Synthetic published browser office",
  );
  expect(
    python(
      `import hashlib,json; from sqlalchemy import text; c=engine.connect(); print(hashlib.sha256(json.dumps({n:sorted(json.dumps(list(r),default=str) for r in c.execute(text('SELECT * FROM '+n))) for n in ['application_registration_payments','subscriptions','membership_approvals']},sort_keys=True).encode()).hexdigest())`,
    ),
  ).toBe(preserved);
  await page.goto("/contact", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("link", { name: "settings-office@example.test" }).first(),
  ).toHaveAttribute("href", "mailto:settings-office@example.test");
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("complementary", { name: "Registration help" })).toContainText(
    "Synthetic published browser office",
  );
  await page.getByLabel("First name (required)").fill("Settings");
  await page.getByLabel("Last name (required)").fill("Synthetic");
  await page.getByLabel("Email address (required)").fill(applicant);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
  await page.goto("/portal/admin/registrations", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Find an application").fill(applicant);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "View application for Settings Synthetic" }).click();
  await page.getByLabel("Receipt / payment reference").fill("SETTINGS-BROWSER-" + suffix);
  await page.getByLabel("Payment date", { exact: true }).fill("2026-01-01");
  await page.getByRole("button", { name: "Record EUR 30 payment" }).click();
  await expect(page.getByRole("button", { name: "Approve membership" })).toBeDisabled();
  await page.getByRole("button", { name: "Verify EUR 30 payment" }).click();
  await page.getByRole("checkbox", { name: acknowledgement }).check();
  await page.getByRole("button", { name: "Approve membership" }).click();
  await page.getByRole("button", { name: "Activate member account" }).click();
  await expect(page.getByRole("heading", { name: "Account activated" })).toBeVisible();
  python(
    `import sys,json; from sqlalchemy.orm import Session; from app.models.user import User; from app.security.hashing import hash_password; db=Session(engine); user=db.query(User).filter_by(email='${applicant}').one(); assert user.is_active and user.password_hash is None; user.password_hash=hash_password(json.load(sys.stdin)['password']); db.commit()`,
    JSON.stringify({ password }),
  );
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await login(page, applicant);
  await expect(page.getByText("Savings summary not available yet")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Registration fee — EUR 30 — Paid" }),
  ).toBeVisible();
  await page.goto("/portal/member/fees", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Registration fee — EUR 30 — Paid" }),
  ).toBeVisible();
  await expect(page.getByText(/EUR 7.5 · Pending/)).toBeVisible();
  await expect(page.getByText(/Due date: .*07/)).toBeVisible();
});

for (const name of ["staff", "member", "writer"])
  test(`${name}: settings permission boundary`, async ({ page }) => {
    await login(page, `settings-browser-${name}@example.test`);
    expect((await page.request.get("/api/admin/organisation-settings")).status()).toBe(
      name === "writer" ? 200 : 403,
    );
    expect(
      (
        await page.request.post("/api/admin/organisation-settings/publish", {
          headers: postHeaders,
          data: { request_key: randomUUID(), version_id: 1 },
        })
      ).status(),
    ).toBe(403);
  });

test("stale editing is rejected and future publication stays isolated until effective", async ({
  page,
}) => {
  await login(page, "settings-browser-admin@example.test");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/portal/admin/settings", { waitUntil: "domcontentloaded" });
  await saved(page).waitFor();
  const state = await (await page.request.get("/api/admin/organisation-settings")).json();
  const currentOffice = (await (await page.request.get("/api/public/contacts")).json()).office;
  const other = await page.request.post("/api/admin/organisation-settings", {
    headers: postHeaders,
    data: {
      request_key: randomUUID(),
      base_version: state.head_version,
      terms: state.versions[0].terms,
    },
  });
  expect(other.status()).toBe(201);
  await page.getByLabel("Office address", { exact: true }).fill("Stale unsaved office");
  await page.getByRole("button", { name: "Save settings draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Settings changed");
  await expect(page.getByLabel("Office address", { exact: true })).toHaveValue(
    "Stale unsaved office",
  );
  await page.getByRole("button", { name: "Reload settings (discard unsaved edits)" }).click();
  await saved(page).waitFor();
  await page.getByLabel("Office address", { exact: true }).fill("Scheduled synthetic office");
  await page.getByRole("button", { name: "Save settings draft" }).click();
  await expect(page.getByRole("button", { name: "Publish saved settings version" })).toBeEnabled();
  await page
    .getByLabel("Effective date and time (your local time; leave blank for immediately)")
    .fill("2000-01-01T10:00");
  await page.getByRole("button", { name: "Publish saved settings version" }).click();
  await expect(page.getByRole("alert")).toContainText("Cannot backdate publication");
  await page
    .getByLabel("Effective date and time (your local time; leave blank for immediately)")
    .fill("2099-01-01T10:00");
  await page.getByRole("button", { name: "Publish saved settings version" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved version published" }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/public/contacts")).json()).office).toBe(
    currentOffice,
  );
  await expect(
    page.getByRole("heading", { name: "Version and publication history" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
