import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const password = randomBytes(24).toString("base64url");
const description = "Isolated synthetic proposal " + randomBytes(6).toString("hex");
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
from app.models.auth import UserPermission,LoginThrottle
from app.models.permission import Permission
from app.security.hashing import hash_password
secret=json.load(sys.stdin)['password']
with Session(engine) as db:
    if not db.query(User).count():bootstrap(db,'draft-bootstrap@example.test',secret)
    db.query(LoginThrottle).delete()
    for name,role in [('admin','administrator'),('readonly','administrator'),('staff','staff'),('member','member')]:
        existing=db.query(User).filter_by(email='draft-browser-'+name+'@example.test').one_or_none()
        if existing:
            existing.password_hash=hash_password(secret)
            continue
        user=User(email='draft-browser-'+name+'@example.test',role_id=db.query(Role).filter_by(name=role).one().id,is_active=True,password_hash=hash_password(secret))
        db.add(user);db.flush()
        if name=='readonly':db.add(UserPermission(user_id=user.id,permission_id=db.query(Permission).filter_by(code='plans:drafts:write').one().id,allowed=False))
    db.commit()
`,
    JSON.stringify({ password }),
  );
});
async function login(page: Page, name: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`draft-browser-${name}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/[^/]+\/dashboard$/);
}
function businessFingerprint() {
  return python(
    `import hashlib,json; from sqlalchemy import text; c=engine.connect(); names=['savings_plans','member_plans','contributions','savings_interests','registration_fees','subscriptions']; data={n:sorted(json.dumps(list(r),default=str) for r in c.execute(text('SELECT * FROM '+n))) for n in names}; print(hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest())`,
  );
}

test("Admin incomplete draft, retry, revisions and PostgreSQL isolation on mobile and desktop", async ({
  page,
}) => {
  test.setTimeout(120_000);
  expect((await page.request.get("/api/admin/plan-drafts")).status()).toBe(401);
  const before = businessFingerprint();
  const offers = await (
    await page.request.get(
      (process.env.ISAVE_E2E_API ?? "http://127.0.0.1:18000") + "/api/v1/plans",
    )
  ).json();
  await login(page, "admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/portal/admin/plans", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.getByLabel("Fixed contribution amount")).toHaveValue("");
  await page.getByLabel("Description", { exact: true }).fill(description);
  await page.getByLabel("Category", { exact: true }).selectOption("education");
  await page.getByLabel("Currency", { exact: true }).focus();
  await page.keyboard.type("usd");
  await expect(page.getByLabel("Currency", { exact: true })).toHaveValue("USD");
  await page.route(
    "**/api/admin/plan-drafts",
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save unpublished draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Save could not be confirmed");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(description);
  await page.getByRole("button", { name: "Retry same save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  const draftId = python(
    `import json; from sqlalchemy.orm import Session; from app.models.plan_draft import PlanDraftVersion; db=Session(engine); rows=[r for r in db.query(PlanDraftVersion).filter_by(actor_email='draft-browser-admin@example.test').all() if json.loads(r.snapshot)['description']=='${description}']; assert len(rows)==1; print(rows[0].draft_id)`,
  );
  await page.getByRole("button", { name: `Review draft ${draftId}`, exact: true }).click();
  await expect(page.getByText(/Missing decisions:/)).toContainText("Contribution amount choice");
  await page.getByLabel("Contribution amount choice").selectOption("member_chosen");
  await page.getByLabel("Contribution cadence").selectOption("weekly");
  await page.getByLabel("Duration choice").selectOption("open_ended");
  await page
    .getByLabel("Proposed missed-contribution rules")
    .fill("Synthetic proposal only; decision remains unapproved.");
  await page
    .getByLabel("Proposed extra-contribution rules")
    .fill("Synthetic proposal only; no posting.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Save unpublished draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: `Review draft ${draftId}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Version history" })).toBeVisible();
  await expect(
    page.getByText(
      "Configuration fields recorded. Separate explicit terms approval and publication are required.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version history" }).locator("..").locator("summary")).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const forbidden = await page.request.put(`/api/admin/plan-drafts/${draftId}`, {
    data: {},
    headers: { Origin: "https://attacker.test", "X-Isave-Request": "1" },
  });
  expect(forbidden.status()).toBe(403);
  expect(
    (await page.request.post(`/api/admin/plan-drafts/${draftId}/publish`, { data: {} })).status(),
  ).toBe(403);
  expect(
    python(
      `from sqlalchemy.orm import Session; from app.models.plan_draft import PlanDraftVersion; db=Session(engine); assert db.query(PlanDraftVersion).filter_by(draft_id=${draftId}).count()==2; print('PASS')`,
    ),
  ).toBe("PASS");
  expect(businessFingerprint()).toBe(before);
  expect(
    await (
      await page.request.get(
        (process.env.ISAVE_E2E_API ?? "http://127.0.0.1:18000") + "/api/v1/plans",
      )
    ).json(),
  ).toEqual(offers);
});

for (const name of ["staff", "member", "readonly"])
  test(`${name}: draft access restrictions`, async ({ page }) => {
    await login(page, name);
    const response = await page.request.get("/api/admin/plan-drafts");
    expect(response.status()).toBe(name === "readonly" ? 200 : 403);
    expect(
      (
        await page.request.post("/api/admin/plan-drafts", {
          data: {},
          headers: {
            Origin: process.env.ISAVE_E2E_ORIGIN ?? "http://127.0.0.1:13000",
            "X-Isave-Request": "1",
          },
        })
      ).status(),
    ).toBe(403);
    if (name === "readonly") {
      await page.goto("/portal/admin/plans", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Saved drafts" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Create draft" })).toHaveCount(0);
    }
  });
