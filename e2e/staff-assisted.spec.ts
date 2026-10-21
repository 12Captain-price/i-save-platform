import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import authorization from "../backend/app/assisted_authorization.json" with { type: "json" };
const password = randomBytes(24).toString("base64url");
const guard = `from app.database import engine; assert engine.url.database=='isave_test_browser','Refusing operational database'; `;
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
      guard + code,
    ],
    { encoding: "utf8", input, windowsHide: true },
  ).trim();
}
const body = {
  first_name: "Assisted",
  last_name: "Browser",
  email: "assisted-applicant@example.test",
  applicant_authorized: true,
  authorization_version: authorization.version,
  preferred_category: "education",
  interest_notice_version: "savings-interest-v1",
};
const postHeaders = {
  Origin: process.env.ISAVE_E2E_ORIGIN ?? "http://127.0.0.1:13000",
  "X-Isave-Request": "1",
};
test.beforeAll(() => {
  python(
    `
import sys,json
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.models.auth import UserPermission,LoginThrottle
from app.security.hashing import hash_password
secret=json.load(sys.stdin)['password']
with Session(engine) as db:
    assert db.query(User).filter(User.email.like('assisted-%')).count()==0
    db.query(LoginThrottle).delete()
    permission=db.query(Permission).filter_by(code='applications:assist').one()
    read=db.query(Permission).filter_by(code='applications:read').one()
    for name,role_name in [('allowed','staff'),('denied','staff'),('submit-only','staff'),('member','member'),('finance','finance'),('admin','administrator')]:
        role=db.query(Role).filter_by(name=role_name).one()
        u=User(email='assisted-'+name+'@example.test',password_hash=hash_password(secret),role_id=role.id,is_active=True)
        db.add(u);db.flush()
        if name in ('allowed','submit-only','member'):
            db.add(UserPermission(user_id=u.id,permission_id=permission.id,allowed=True))
        if name=='submit-only':db.add(UserPermission(user_id=u.id,permission_id=read.id,allowed=False))
    db.commit()
`,
    JSON.stringify({ password }),
  );
});
async function login(page: import("@playwright/test").Page, name: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page
    .getByLabel("Email address", { exact: true })
    .fill("assisted-" + name + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/[^/]+\/dashboard$/);
}
async function logout(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("authorised assisted registration: consent, lost response, persisted actor and protected review", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await page.request.post("/api/registration/assisted", { headers: postHeaders, data: body })
    ).status(),
  ).toBe(401);
  await login(page, "allowed");
  await page.goto("/portal/staff/registrations", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Assist an applicant", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/assist-registration$/);
  const consent = page.getByRole("checkbox", { name: authorization.wording });
  await expect(consent).not.toBeChecked();
  await page.getByLabel("First name (required)").fill(body.first_name);
  await page.getByLabel("Last name (required)").fill(body.last_name);
  await page.getByLabel("Email address (required)").fill(body.email);
  await page.getByRole("radio", { name: "Education", exact: true }).locator("..").click();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole("heading", { name: "Application received" })).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/registration/assisted", {
        headers: postHeaders,
        data: { ...body, applicant_authorized: false },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/registration/assisted", {
        headers: postHeaders,
        data: { ...body, actor_user_id: 999 },
      })
    ).status(),
  ).toBe(400);
  await consent.focus();
  await page.keyboard.press("Space");
  await expect(consent).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/assisted-form-mobile.png", fullPage: true });
  await page.route(
    "**/api/registration/assisted",
    async (route) => {
      const r = await route.fetch();
      expect(r.status()).toBe(202);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(consent).toBeChecked();
  await expect(page.getByLabel("Email address (required)")).toHaveValue(body.email);
  await page.getByRole("button", { name: "Retry submission" }).click();
  await expect(page.getByRole("status", { name: "Application received" })).toBeFocused();
  expect(
    python(
      `from sqlalchemy.orm import Session; from app.models.application import MembershipApplication,ApplicationSubmission,ApplicationEvent,SavingsInterest; db=Session(engine); a=db.query(MembershipApplication).filter_by(email='assisted-applicant@example.test').one(); s=db.get(ApplicationSubmission,a.id); print(a.status,s.source,s.actor_email,s.applicant_authorized,s.authorization_version,db.query(ApplicationEvent).filter_by(application_id=a.id).count(),db.query(SavingsInterest).filter_by(application_id=a.id).one().category)`,
    ),
  ).toBe(
    "Pending staff_assisted assisted-allowed@example.test True applicant-authorization-v1 1 education",
  );
  await page.goto("/portal/staff/registrations", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Find an application").fill(body.email);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "View application for Assisted Browser" }).click();
  const source = page.getByRole("region", { name: "Submission source and authorisation" });
  await expect(source).toContainText("Staff-assisted");
  await expect(source).toContainText("assisted-allowed@example.test");
  await expect(source).toContainText(authorization.wording);
  await expect(source).toContainText(authorization.version);
  await expect(page.getByText("Actor identity: assisted-allowed@example.test")).toBeVisible();
  await page.screenshot({ path: "test-results/assisted-review-mobile.png", fullPage: true });
  await logout(page);
  await login(page, "admin");
  const duplicate = await page.request.post("/api/registration/assisted", {
    headers: postHeaders,
    data: body,
  });
  expect(duplicate.status()).toBe(202);
  expect(await duplicate.json()).toEqual({ received: true });
  await page.goto("/portal/admin/registrations", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Find an application").fill(body.email);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "View application for Assisted Browser" }).click();
  await expect(source).toContainText("assisted-allowed@example.test");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/assisted-review-desktop.png", fullPage: true });
  await logout(page);
});

test("members, finance and staff lacking permission cannot assist", async ({ page }) => {
  test.setTimeout(90_000);
  for (const name of ["denied", "member", "finance"]) {
    await login(page, name);
    expect(
      (
        await page.request.post("/api/registration/assisted", { headers: postHeaders, data: body })
      ).status(),
    ).toBe(403);
    if (name === "denied") {
      await page.goto("/portal/staff/registrations", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("link", { name: "Assist an applicant" })).toHaveCount(0);
      await page.goto("/portal/staff/assist-registration", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
      await expect(page.locator("form")).toHaveCount(0);
    }
    await logout(page);
  }
});

test("assisted submission without review permission reveals no earlier records", async ({
  page,
}) => {
  await login(page, "submit-only");
  await page.goto("/portal/staff/registrations", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Assist an applicant" })).toBeVisible();
  expect((await page.request.get("/api/review/applications")).status()).toBe(403);
  const duplicate = await page.request.post("/api/registration/assisted", {
    headers: postHeaders,
    data: body,
  });
  const known = await page.request.post("/api/registration/assisted", {
    headers: postHeaders,
    data: { ...body, email: "assisted-member@example.test" },
  });
  expect(duplicate.status()).toBe(202);
  expect(await duplicate.json()).toEqual(await known.json());
  expect(await known.json()).toEqual({ received: true });
  await logout(page);
});
