import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
const evidenceDirectory="docs/registration-documents-enrolment/workflows";mkdirSync(evidenceDirectory,{recursive:true});

const password = randomBytes(24).toString("base64url");
const suffix = randomBytes(5).toString("hex");
const adminEmail = `evidence-admin-${suffix}@example.test`,
  memberEmail = `enrol-member-${suffix}@example.test`,
  applicantEmail = `private-evidence-${suffix}@example.test`;
const compose = [
  "compose",
  "-p",
  process.env.ISAVE_E2E_PROJECT ?? "isave-documents-rehearsal",
  "-f",
  "compose.auth-test.yaml",
  "-f",
  "compose.documents-test.yaml",
];
function python(code: string, input?: object) {
  return execFileSync(
    "docker",
    [
      ...compose,
      "exec",
      "-T",
      "backend",
      "python",
      "-c",
      `from app.database import engine; assert engine.url.database=='isave_test_browser'; ` + code,
    ],
    {
      input: JSON.stringify(input ?? {}),
      encoding: "utf8",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  ).trim();
}
test.beforeAll(() => {
  python(
    `
import sys,json
from uuid import uuid4
from sqlalchemy.orm import Session
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.application import MembershipApplication
from app.models.membership import MembershipApproval
from app.models.business_settings import BusinessSettingsVersion,BusinessSettingsPublication
from app.models.auth import LoginThrottle
from app.security.hashing import hash_password
from app.security.auth import now
from app.services.business_settings import active
from app.services import membership
from app.schemas.membership import PaymentRecord
data=json.load(sys.stdin)
with Session(engine) as db:
 if not db.query(User).count():bootstrap(db,data['admin'],data['password'])
 actor=User(email=data['admin'],password_hash=hash_password(data['password']),role_id=db.query(Role).filter_by(name='administrator').one().id,is_active=True) if not db.query(User).filter_by(email=data['admin']).first() else db.query(User).filter_by(email=data['admin']).one()
 db.add(actor);db.commit()
 app=MembershipApplication(application_number='ENROL-'+data['suffix'],first_name='Synthetic',last_name='Plan member',email=data['member'],status='Pending')
 db.add(app);db.commit()
 _,terms=active(db)
 membership.record_payment(db,actor,app.id,PaymentRecord(amount=terms['registration_amount'],currency=terms['registration_currency'],payment_date='2026-01-01',reference='ENROL-RECEIPT-'+data['suffix']));db.commit()
 membership.verify_payment(db,actor,app.id);db.commit();membership.approve(db,actor,app.id);db.commit();membership.activate(db,actor,app.id);db.commit()
 approval=db.get(MembershipApproval,app.id);db.get(User,approval.user_id).password_hash=hash_password(data['password'])
 # New submission requirements only; fixture membership above remains historical.
 head=db.query(BusinessSettingsVersion).order_by(BusinessSettingsVersion.id.desc()).first()
 row=BusinessSettingsVersion(base_version=head.id if head else 0,request_key=str(uuid4()),snapshot=json.dumps({**terms,'require_national_id':True,'require_residence_evidence':True,'require_income_evidence':True,'require_evidence_acceptance':True}),actor_id=actor.id,actor_email=actor.email)
 db.add(row);db.flush();db.add(BusinessSettingsPublication(version_id=row.id,request_key=str(uuid4()),request_snapshot='synthetic document rehearsal',effective_at=now(),actor_id=actor.id,actor_email=actor.email));db.query(LoginThrottle).delete();db.commit()
`,
    { admin: adminEmail, member: memberEmail, password, suffix },
  );
});
async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/portal/**/dashboard");
}
async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/login");
}
const image = {
  name: "synthetic.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=",
    "base64",
  ),
};

test("private registration evidence, safe retry, authorised history and protected downloads", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // Generate valid synthetic image via the same image library; no personal document fixture.
  const png = python(
    `import io,base64; from PIL import Image; b=io.BytesIO(); Image.new('RGB',(10,10),'green').save(b,format='PNG'); print(base64.b64encode(b.getvalue()).decode())`,
  );
  const file = { ...image, buffer: Buffer.from(png, "base64") };
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel("National ID number (required)").fill("SYNTHETIC-ONLY-" + suffix);
  await page.getByLabel("Source of income (required)").selectOption("self_employed");
  await page.getByLabel("Proof of residence (required)").setInputFiles(file);
  await page
    .getByLabel("Alternative income evidence for self-employment (required)")
    .setInputFiles(file);
  const consent = page.getByRole("checkbox", { name: /I authorise i-Save/ });
  await expect(consent).not.toBeChecked();
  await consent.focus();await page.keyboard.press("Space");await expect(consent).toBeChecked();
  await page.getByLabel("First name (required)").fill("Private");
  await page.getByLabel("Last name (required)").fill("Synthetic " + suffix);
  await page.getByLabel("Email address (required)").fill(applicantEmail);
  await page.route(
    "**/api/registration",
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(202);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("National ID number (required)")).toHaveValue(
    "SYNTHETIC-ONLY-" + suffix,
  );
  await page.getByRole("button", { name: "Retry submission" }).click();
  await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
  expect(
    python(
      `from sqlalchemy.orm import Session; from app.models.application import MembershipApplication; from app.models.evidence_enrolment import ApplicationEvidence; db=Session(engine); app=db.query(MembershipApplication).filter_by(email='${applicantEmail}').one(); print(db.query(ApplicationEvidence).filter_by(application_id=app.id).count())`,
    ),
  ).toBe("2");
  await login(page, adminEmail);
  await page.goto("/portal/admin/registrations");
  await page.getByLabel("Find an application").fill(applicantEmail);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", { name: `View application for Private Synthetic ${suffix}` })
    .click();
  const docs = page.getByRole("region", { name: "Documents", exact: true });
  await expect(docs).toContainText("SYNTHETIC-ONLY-" + suffix);
  await expect(docs).toContainText("Awaiting review");
  const article = docs.locator("article").first();
  const form = article.locator("form");
  await form.getByLabel("Outcome").selectOption("Further information requested");
  await form.getByLabel("Review reason").fill("Synthetic clarification requested");
  await form.getByRole("button", { name: "Record document review" }).click();
  await expect(docs).toContainText("Synthetic clarification requested");
  await expect(docs).toContainText(adminEmail);
  const link = article.getByRole("link", { name: /Download private evidence/ });
  const path = await link.getAttribute("href");
  const download = await page.request.get(path!);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toMatch(/^attachment; filename="evidence-/);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(new URL(path!, page.url()).href)).status()).toBe(401);
  await anonymous.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:evidenceDirectory+"/documents-review-390.png",fullPage:true});
  await logout(page);
});

test("complete plan terms require explicit approval/publication; owned application and activation never post savings", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await login(page, adminEmail);
  await page.goto("/portal/admin/plans");
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  const editor = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "New unpublished draft" }) });
  await editor.getByLabel("Category", { exact: true }).selectOption("education");
  await editor
    .getByLabel("Description", { exact: true })
    .fill("Synthetic eight-month plan " + suffix);
  await editor.getByLabel("Currency", { exact: true }).fill("USD");
  await editor.getByRole("button", { name: "Save unpublished draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  const list = await (await page.request.get("/api/admin/plan-drafts")).json();
  const draft = list.items.find(
    (d: { terms: { description: string } }) =>
      d.terms.description === "Synthetic eight-month plan " + suffix,
  );
  expect(draft).toBeTruthy();
  await page.getByRole("button", { name: `Review draft ${draft.draft_id}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve saved terms" })).toBeDisabled();
  const edit = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", { name: new RegExp("Edit draft " + draft.draft_id) }),
    });
  await edit.getByLabel("Contribution amount choice").selectOption("member_chosen");
  await edit.getByLabel("Contribution cadence").selectOption("weekly");
  await edit.getByLabel("Duration choice").selectOption("calendar_months");
  await edit.getByLabel("Duration in calendar months").fill("8");
  await edit
    .getByLabel("Proposed missed-contribution rules")
    .fill("No automatic penalties, deductions, debt or suspension.");
  await edit
    .getByLabel("Proposed extra-contribution rules")
    .fill("Voluntary extra contributions require separate authorised processing.");
  await edit.getByLabel("Missed-target policy").selectOption("no_automatic_consequences");
  await edit.getByLabel("Extra-contribution policy").selectOption("voluntary_no_automatic_posting");
  await edit
    .getByLabel("Withdrawal-access boundary")
    .selectOption("after_completion_14_days_notice_review_unavailable");
  await edit.getByLabel("Benefits and returns").selectOption("unavailable");
  await edit.getByRole("button", { name: "Save unpublished draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  expect(
    (await (await page.request.get("/api/public/plan-offers")).json()).items.some(
      (p: { draft_id: number }) => p.draft_id === draft.draft_id,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: `Review draft ${draft.draft_id}`, exact: true }).click();
  let preview = page.getByRole("region", { name: "Plan publication preview" });
  await expect(preview.getByRole("checkbox")).not.toBeChecked();
  await preview.getByRole("checkbox").check();
  await preview.getByRole("button", { name: "Approve saved terms" }).click();
  await expect(preview).toContainText("Approved by");
  await preview.getByRole("checkbox").check();
  await preview.getByRole("button", { name: "Publish approved version" }).click();
  await expect(preview).toContainText("Published/scheduled by");
  await logout(page);
  await login(page, memberEmail);
  await page.goto("/portal/member/plans");
  const offer = page
    .locator("article")
    .filter({ hasText: "Synthetic eight-month plan " + suffix })
    .first();
  await expect(offer).toContainText("Eight calendar months");
  await expect(offer).toContainText("at least two weeks");
  await expect(offer.getByRole("checkbox")).not.toBeChecked();
  await offer.getByRole("spinbutton").fill("12.50");
  await offer.getByRole("checkbox").check();
  await page.route(
    "**/api/member/plan-applications",
    async (route) => {
      if (route.request().method() === "POST") {
        const r = await route.fetch();
        expect(r.status()).toBe(201);
        await route.abort("failed");
      } else await route.continue();
    },
    { times: 1 },
  );
  await offer.getByRole("button", { name: "Submit plan application" }).click();
  await expect(offer.getByRole("alert")).toBeVisible();
  await offer.getByRole("button", { name: "Retry same plan application" }).click();
  await expect(offer.getByRole("status")).toContainText("Plan application recorded");
  const requests = await (await page.request.get("/api/member/plan-applications")).json();
  const request =
    requests.items.find(
      (r: { version_id: number }) => r.version_id === draft.publication_preview?.version_id,
    ) ||
    requests.items.find(
      (r: { terms: { description: string } }) =>
        r.terms.description === "Synthetic eight-month plan " + suffix,
    );
  expect(request).toBeTruthy();
  await logout(page);
  await login(page, adminEmail);
  await page.goto("/portal/admin/plan-applications");
  await page.getByLabel("Search member number, name or status").fill("Plan member");
  await page.getByRole("button", { name: "Search plan applications" }).click();
  const section = page
    .locator("section")
    .filter({ has: page.getByText(`Plan application ${request.id} · Pending`, { exact: true }) })
    .last();
  await section.getByLabel("Decision", { exact: true }).selectOption("Approved", {timeout:10000});
  await section.getByLabel("Reason", { exact: true }).fill("Synthetic plan review approved");
  await section.getByRole("button", { name: "Record plan decision" }).click();
  await page.getByRole("button", { name: `Activate enrolment ${request.id}` }).click();
  await expect(
    page.getByText(`Plan application ${request.id} · Active`, { exact: true }),
  ).toBeVisible();
  await logout(page);
  await login(page, memberEmail);
  await page.goto("/portal/member/dashboard");
  await expect(page.getByText(/Programme completion/)).toBeVisible();
  await expect(page.getByText("No confirmed ledger credits recorded.", { exact: true })).toBeVisible();
  await page.goto("/portal/member/plans");
  await expect(
    page.getByText(`Plan application ${request.id} · Active`, { exact: true }),
  ).toBeVisible();
  expect(
    python(
      `from sqlalchemy.orm import Session; from app.models.evidence_enrolment import PlanApplication,PlanEnrolment; from app.models.contribution import Contribution; db=Session(engine); a=db.get(PlanApplication,${request.id}); assert db.query(PlanApplication).filter_by(member_id=a.member_id,draft_id=a.draft_id).count()==1; assert db.query(PlanEnrolment).filter_by(application_id=a.id).count()==1; assert db.query(Contribution).filter_by(member_id=a.member_id).count()==0; print('PASS')`,
    ),
  ).toBe("PASS");
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:evidenceDirectory+"/member-plans-1440.png",fullPage:true});
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:evidenceDirectory+"/member-plans-390.png",fullPage:true});
  await logout(page);
});
