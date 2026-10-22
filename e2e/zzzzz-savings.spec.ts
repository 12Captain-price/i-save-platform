import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
const password = randomBytes(24).toString("base64url");
const suffix = randomBytes(4).toString("hex");
const admin = `savings-admin-${suffix}@example.test`,
  member = `savings-member-${suffix}@example.test`;
const container = (process.env.ISAVE_E2E_PROJECT ?? "isave-savings-test") + "-backend-1";
function python(code: string, input: object = {}) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "python",
      "-c",
      `from app.database import engine; assert engine.url.database=='isave_test_browser'; ` + code,
    ],
    {
      input: JSON.stringify(input),
      encoding: "utf8",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  ).trim();
}
test.beforeAll(() =>
  python(
    `
import sys,json
from sqlalchemy.orm import Session
from app.savings_rehearsal import seed
data=json.load(sys.stdin)
with Session(engine) as db:seed(db,data['admin'],data['password'],data['member'],data['password'])
`,
    { admin, member, password },
  ),
);
async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/portal/**/dashboard");
}
test("office pending, lost-response retry, verification, discrepancy, reconciliation, owned receipt and linked reversal", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, admin);
  await page.goto("/portal/admin/contributions");
  const enrolment = page.getByLabel("Active enrolment", { exact: true });
  await expect(enrolment).toBeVisible();
  const option = enrolment
    .locator("option")
    .filter({ hasText: new RegExp(`SYNTHETIC-SAVINGS-.*USD`) })
    .last();
  const enrolmentId = await option.getAttribute("value");
  await enrolment.selectOption(enrolmentId!);
  await page.getByLabel("Amount in enrolment currency").fill("10.00");
  await page
    .getByLabel("Payment date", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Payment method").fill("Synthetic cash");
  const reference = "BROWSER-SAVINGS-" + suffix;
  await page.getByLabel("Receipt/payment reference").fill(reference);
  let lost = false;
  await page.route("**/api/savings", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Record pending contribution", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry exact contribution request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry exact contribution request" }).click();
  await page.unroute("**/api/savings");
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: new RegExp(reference) }) });
  await expect(card).toContainText("Pending verification");
  await expect(card).toContainText("Not a confirmed receipt");
  const title = await card.getByRole("heading").innerText();
  const id = title.match(/Contribution (\d+)/)![1];
  const decide = async (action: string, outcome: string, observed = "10.00") => {
    const form = card.locator("form").filter({
      has: page.getByRole("button", { name: `Record ${action} decision ${id}`, exact: true }),
    });
    await form.getByLabel(`${action} decision ${id}`, { exact: true }).selectOption(outcome);
    await form.getByLabel("Evidence or reconciliation reference").fill("SYNTHETIC-COUNT-" + suffix);
    await form.getByLabel("Reason", { exact: true }).fill("TEST ONLY office evidence checked");
    if (action === "reconcile") {
      await form.getByLabel("Observed payment amount").fill(observed);
      await form.getByLabel("Observed currency").selectOption("USD");
      await form.getByLabel("Observed payment reference").fill(reference);
    }
    await form
      .getByRole("button", { name: `Record ${action} decision ${id}`, exact: true })
      .click();
  };
  await decide("verify", "Verified");
  await expect(card.getByText("USD 10.00 · Verified", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No confirmed ledger credits recorded.", { exact: true }),
  ).toBeVisible();
  await decide("reconcile", "Discrepancy", "9.00");
  await expect(card.getByText("USD 10.00 · Discrepancy", { exact: true })).toBeVisible();
  await decide("reconcile", "Matched");
  await expect(card.getByText("USD 10.00 · Confirmed", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveJSProperty("scrollWidth", 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: `View receipt ${id}`, exact: true }).click();
  await expect(page.getByRole("region", { name: "Contribution receipt" })).toContainText(reference);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const own = await context.newPage();
  await login(own, member);
  await own.goto("/portal/member/contributions");
  await expect(own.getByText("USD 10.00 · Confirmed", { exact: true })).toBeVisible();
  expect((await own.request.get("/api/savings?member_id=1")).status()).toBe(400);
  expect(
    (
      await own.request.post(`/api/savings/${id}/reverse`, {
        headers: { "X-Isave-Request": "1", Origin: new URL(own.url()).origin },
        data: {
          request_key: randomUUID(),
          base_event_id: 0,
          outcome: "Reversed",
          evidence_reference: "SYNTHETIC",
          reason: "Member must be denied",
        },
      })
    ).status(),
  ).toBe(403);
  await own.getByRole("button", { name: `View receipt ${id}`, exact: true }).click();
  await expect(own.getByRole("region", { name: "Contribution receipt" })).toContainText(
    "Confirmed receipt",
  );
  await decide("reverse", "Reversed");
  await expect(card.getByText("USD 10.00 · Reversed", { exact: true })).toBeVisible();
  await own.reload();
  await expect(own.getByText("USD 10.00 · Reversed", { exact: true })).toBeVisible();
  await own.getByRole("button", { name: `View receipt ${id}`, exact: true }).click();
  await expect(own.getByRole("region", { name: "Contribution receipt" })).toContainText(
    "Reversed receipt",
  );
  await own.getByRole("button", { name: "Log out", exact: true }).click();
  await context.close();
  const checks = JSON.parse(
    python(`
import json
from sqlalchemy.orm import Session
from app.models.savings import SavingsContribution,SavingsLedgerEntry
with Session(engine) as db:
 r=db.query(SavingsContribution).filter_by(reference='${reference}').one()
 entries=db.query(SavingsLedgerEntry).filter_by(contribution_id=r.id).all()
 print(json.dumps({'count':db.query(SavingsContribution).filter_by(reference=r.reference).count(),'ledger_count':len(entries),'net':str(sum(e.amount for e in entries))}))
`),
  );
  expect(checks).toEqual({ count: 1, ledger_count: 2, net: "0.00" });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
});

test("specifically authorised Finance uses real verification, reconciliation and ledger queues", async ({
  page,
}) => {
  python(
    `
import sys,json
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.models.auth import UserPermission
with Session(engine) as db:
 data=json.load(sys.stdin);actor=db.query(User).filter_by(email=data['email']).one();actor.role_id=db.query(Role).filter_by(name='finance').one().id
 for action in ['read','record','verify','reconcile','extra','reverse']:
  permission=db.query(Permission).filter_by(code='savings:'+action).one()
  db.add(UserPermission(user_id=actor.id,permission_id=permission.id,allowed=True))
 db.commit()
 `,
    { email: admin },
  );
  await login(page, admin);
  await page.goto("/portal/finance/verification");
  await expect(
    page.getByRole("heading", { name: "Savings contributions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record pending contribution", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/savings?status=Pending%20verification")).status()).toBe(200);
  await page.goto("/portal/finance/reconciliation");
  await expect(
    page.getByRole("heading", { name: "Savings contributions", exact: true }),
  ).toBeVisible();
  await page.goto("/portal/finance/ledger");
  await expect(
    page.getByRole("heading", { name: "Savings contributions", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/awaiting implementation/i)).toHaveCount(0);
  const denied = await page.request.get("/api/admin/organisation-settings");
  expect(denied.status()).toBe(403);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
});
