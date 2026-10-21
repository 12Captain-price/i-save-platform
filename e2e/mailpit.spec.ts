import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
test.skip(
  process.env["ISAVE_MAILPIT_TEST"] !== "1",
  "Use the isolated Mailpit compose overlay explicitly.",
);
test.describe.configure({ mode: "serial" });
const secret = randomBytes(24).toString("base64url");
const compose = [
  "compose",
  "-p",
  process.env.ISAVE_E2E_PROJECT ?? "isave-browser-auth",
  "-f",
  "compose.auth-test.yaml",
  "-f",
  "compose.mailpit-test.yaml",
];
const headers = {
  Origin: process.env.ISAVE_E2E_ORIGIN ?? "http://127.0.0.1:13000",
  "X-Isave-Request": "1",
};
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
    { encoding: "utf8", windowsHide: true, ...(input ? { input: JSON.stringify(input) } : {}) },
  ).trim();
}
test.beforeAll(() => {
  python(
    `
import sys,json
from sqlalchemy.orm import Session
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.security.hashing import hash_password
with Session(engine) as db:
    password=json.load(sys.stdin)['password']
    assert db.query(User).filter_by(email='mailpit-admin@example.test').count()==0
    if db.query(User).count()==0:bootstrap(db,'mailpit-admin@example.test',password)
    else:
        db.add(User(email='mailpit-admin@example.test',password_hash=hash_password(password),role_id=db.query(Role).filter_by(name='administrator').one().id,is_active=True));db.commit()
`,
    { password: secret },
  );
});
async function login(page: Page, email = "mailpit-admin@example.test") {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/\w+\/dashboard$/);
}
async function activated(page: Page, label: string) {
  await login(page);
  const email = `mailpit-${label}@example.test`;
  expect(
    (
      await page.request.post("/api/registration", {
        headers,
        data: { first_name: "Mailpit", last_name: label, email },
      })
    ).status(),
  ).toBe(202);
  const id = Number(
    python(
      `from sqlalchemy.orm import Session; from app.models.application import MembershipApplication; db=Session(engine); print(db.query(MembershipApplication).filter_by(email='${email}').one().id)`,
    ),
  );
  for (const [action, data] of [
    [
      "payment",
      {
        amount: "20.00",
        currency: "USD",
        payment_date: "2026-01-01",
        reference: "MAILPIT-" + label,
      },
    ],
    ["verify", {}],
    ["approve", { acknowledged: true, acknowledgement_version: "membership-review-v1" }],
    ["activate", {}],
  ] as const) {
    expect(
      (
        await page.request.post(`/api/membership/applications/${id}/${action}`, { headers, data })
      ).status(),
    ).toBe(200);
  }
  await page.goto("/portal/admin/registrations", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Find an application").fill(email);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: `View application for Mailpit ${label}` }).click();
  await expect(page.getByRole("heading", { name: "Account activated" })).toBeVisible();
  return { id, email };
}
async function inbox(page: Page, email: string) {
  const data = await (await fetch("http://127.0.0.1:18025/api/v1/messages")).json();
  return (data.messages as { ID: string; To: { Address: string }[] }[]).filter((m) =>
    m.To.some((r) => r.Address === email),
  );
}
async function link(page: Page, email: string) {
  await expect.poll(async () => (await inbox(page, email)).length).toBeGreaterThan(0);
  const messages = await inbox(page, email);
  const message = await (
    await fetch(`http://127.0.0.1:18025/api/v1/message/${messages[0]!.ID}`)
  ).json();
  const match = String(message.Text).match(
    /http:\/\/127\.0\.0\.1:13000\/setup-password#token=[A-Za-z0-9_-]{43}/,
  );
  expect(!!match).toBe(true);
  expect(String(message.Text).includes("not delivered externally")).toBe(true);
  return match![0];
}
async function setup(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByLabel("New password", { exact: true }).fill(secret);
  await page.getByLabel("Confirm password", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Set password", exact: true }).click();
}
test("activation, Mailpit capture, lost-response retry, private password setup and used-link refusal", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { id, email } = await activated(page, "capture");
  await expect(page.getByText(/Mailpit local testing:/)).toBeVisible();
  await page.route(
    `**/api/membership/applications/${id}/invitation`,
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  const capture = page.getByRole("button", { name: "Capture password setup email locally" });
  await capture.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await capture.click();
  await expect(page.getByText("Mailpit accepted", { exact: true })).toBeVisible();
  expect((await inbox(page, email)).length).toBe(1);
  const url = await link(page, email);
  const token = url.split("token=")[1]!;
  const response = await (await page.request.get(`/api/membership/applications/${id}`)).text();
  expect(response.includes(token) || response.includes("/setup-password#token=")).toBe(false);
  expect(
    python(
      `from sqlalchemy.orm import Session; from app.models.membership import PasswordSetupInvitation; db=Session(engine); print(db.query(PasswordSetupInvitation).filter_by(application_id=${id}).count())`,
    ),
  ).toBe("1");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await setup(page, url);
  await expect(page.getByRole("heading", { name: "Password set" })).toBeVisible();
  expect(new URL(page.url()).hash === "").toBe(true);
  await setup(page, url);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Password set" })).toHaveCount(0);
  await login(page, email);
  await page.goto("/portal/member/fees", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Registration fee — US$20 — Paid" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const logs = execFileSync("docker", [...compose, "logs", "--no-color", "backend"], {
    encoding: "utf8",
    windowsHide: true,
  });
  expect(logs.includes(token) || logs.includes("/setup-password#token=")).toBe(false);
});
test("captured invitation expires without changing activation or payment", async ({ page }) => {
  const { id, email } = await activated(page, "expired");
  await page.getByRole("button", { name: "Capture password setup email locally" }).click();
  await expect(page.getByText("Mailpit accepted", { exact: true })).toBeVisible();
  const url = await link(page, email);
  python(
    `from sqlalchemy.orm import Session; from app.models.membership import PasswordSetupInvitation; from app.security.auth import now; from datetime import timedelta; db=Session(engine); row=db.query(PasswordSetupInvitation).filter_by(application_id=${id}).one(); row.expires_at=now()-timedelta(seconds=1); db.commit()`,
  );
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await setup(page, url);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Password set" })).toHaveCount(0);
});
test("SMTP failure is durable, retries do not resend, explicit replacement captures once", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { id, email } = await activated(page, "failure");
  const key = randomUUID();
  execFileSync("docker", [...compose, "stop", "mailpit"], { windowsHide: true, stdio: "pipe" });
  try {
    expect(
      (
        await page.request.post(`/api/membership/applications/${id}/invitation`, {
          headers,
          data: { request_key: key },
        })
      ).status(),
    ).toBe(503);
    expect(
      (
        await page.request.post(`/api/membership/applications/${id}/invitation`, {
          headers,
          data: { request_key: key },
        })
      ).status(),
    ).toBe(409);
  } finally {
    execFileSync("docker", [...compose, "start", "mailpit"], { windowsHide: true, stdio: "pipe" });
  }
  await expect
    .poll(async () => {
      try {
        return (await page.request.get("http://127.0.0.1:18025/api/v1/messages")).ok();
      } catch {
        return false;
      }
    })
    .toBe(true);
  const next = randomUUID();
  const statuses = await Promise.all(
    [1, 2].map(async () =>
      (
        await page.request.post(`/api/membership/applications/${id}/invitation`, {
          headers,
          data: { request_key: next },
        })
      ).status(),
    ),
  );
  expect(statuses.includes(200)).toBe(true);
  expect(statuses.every((s) => [200, 409].includes(s))).toBe(true);
  expect(
    (
      await page.request.post(`/api/membership/applications/${id}/invitation`, {
        headers,
        data: { request_key: next },
      })
    ).status(),
  ).toBe(200);
  expect((await inbox(page, email)).length).toBe(1);
  expect(
    python(`
from sqlalchemy.orm import Session
from app.models.membership import PasswordSetupInvitation,MembershipApproval,ApplicationRegistrationPayment
with Session(engine) as db:
    rows=db.query(PasswordSetupInvitation).filter_by(application_id=${id}).all()
    assert len(rows)==2 and sum(r.revoked_at is not None for r in rows)==1
    assert db.get(MembershipApproval,${id}).activated_at and db.get(ApplicationRegistrationPayment,${id}).verified_at
    print('PASS')
`),
  ).toBe("PASS");
  await page.getByRole("button", { name: "Log out" }).click();
});
