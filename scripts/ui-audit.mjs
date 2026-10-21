import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { textContrast } from "./text-contrast.mjs";
const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw Error("Specify before or after");
const origin = "http://127.0.0.1:13010",
  project = "isave-ui-review";
const secret = randomBytes(24).toString("base64url");
execFileSync(
  "docker",
  [
    "compose",
    "-p",
    project,
    "-f",
    "compose.auth-test.yaml",
    "-f",
    "compose.ui-test.yaml",
    "exec",
    "-T",
    "backend",
    "python",
    "-c",
    `
import sys,json
from sqlalchemy.orm import Session
from app.database import engine
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.member import Member
from app.security.hashing import hash_password
assert engine.url.database=='isave_test_browser'
secret=json.load(sys.stdin)['password']
with Session(engine) as db:
 if not db.query(User).count():bootstrap(db,'audit-bootstrap@example.test',secret)
 for name in ['admin','member','staff','finance']:
  email='ui-audit-'+name+'@example.test'
  user=db.query(User).filter_by(email=email).one_or_none()
  if not user:
   user=User(email=email,role_id=db.query(Role).filter_by(name='administrator' if name=='admin' else name).one().id,is_active=True);db.add(user);db.flush()
   if name=='member':db.add(Member(member_number='UI-AUDIT',first_name='Synthetic',last_name='UI audit',user_id=user.id))
  user.password_hash=hash_password(secret)
 db.commit()
`,
  ],
  {
    input: JSON.stringify({ password: secret }),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  },
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROME_PATH,
});
const directory = `docs/ui-review/${phase}`;
mkdirSync(directory, { recursive: true });
const report = [];
const publicRoutes = [
  "/",
  "/how-it-works",
  "/plans",
  "/plans/asset-savings",
  "/plans/holiday-savings",
  "/plans/emergency-savings",
  "/plans/retrenchment-savings",
  "/plans/education-savings",
  "/fees",
  "/register",
  "/login",
  "/contact",
  "/faqs",
  "/about",
  "/team",
  "/events",
  "/announcements",
  "/terms",
  "/privacy",
  "/disclosures",
  "/eligibility",
  "/recovery",
  "/verify",
  "/setup-password",
];
if (phase === "after")
  publicRoutes.push(
    "/portal",
    "/portal/member/login",
    "/portal/member/register",
    "/portal/member/recovery",
    "/portal/member/verify",
    "/portal/member/setup-password",
  );
const navigation = readFileSync("src/lib/portal/navigation.ts", "utf8");
async function inspect(page, path, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  if (phase === "after") await page.locator("h1").waitFor({ state: "attached", timeout: 10000 });
  const data = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelectorAll("h1").length,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    unlabelled: [...document.querySelectorAll("input:not([type=hidden]),select,textarea")].filter(
      (e) =>
        !e.labels?.length && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby"),
    ).length,
    main: !!document.querySelector("main"),
  }));
  const contrast = phase === "after" ? await page.evaluate(textContrast) : null;
  report.push({ path, width, ...data, contrast });
  const representative = [
    "/",
    "/fees",
    "/register",
    "/portal/admin/settings",
    "/portal/admin/registrations",
    "/portal/member/dashboard",
    "/portal/staff/registrations",
    "/portal/finance/fees",
  ];
  if (representative.includes(path) && [390, 1440].includes(width)) {
    await page.screenshot({
      path: `${directory}/${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}-${width}.png`,
      fullPage: true,
    });
    if (phase === "after" && ["/", "/portal/admin/settings"].includes(path))
      await page.screenshot({
        path: `${directory}/${path === "/" ? "home" : "settings"}-${width}-viewport.png`,
      });
  }
}
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  for (const path of publicRoutes)
    for (const width of [360, 390, 768, 1440]) await inspect(page, path, width);
  await context.close();
  for (const role of ["member", "staff", "finance", "admin"]) {
    const context = await browser.newContext({ reducedMotion: "reduce" }),
      page = await context.newPage();
    await page.goto(origin + "/login");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("ui-audit-" + role + "@example.test");
    await page.getByLabel("Password", { exact: true }).fill(secret);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL(`**/portal/${role}/dashboard`);
    const block = navigation.match(new RegExp(role + ":\\s*\\[([\\s\\S]*?)\\]"))?.[1] ?? "";
    const screens = [...block.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
    if (["admin", "staff"].includes(role)) screens.push("assist-registration");
    if (phase === "after" && role === "staff") screens.push("member-record");
    for (const screen of screens)
      for (const width of [360, 390, 768, 1440])
        await inspect(page, `/portal/${role}/${screen}`, width);
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${directory}/audit.json`, JSON.stringify(report, null, 2));
}
const failures = report.filter(
  (r) => r.overflow || r.unlabelled || r.h1 !== 1 || !r.main || r.contrast?.issues.length,
);
console.log(
  JSON.stringify({
    phase,
    checks: report.length,
    overflow: report.filter((r) => r.overflow),
    unlabelled: report.filter((r) => r.unlabelled),
    missingHeading: report.filter((r) => r.h1 !== 1),
    contrastIssues: report
      .filter((r) => r.contrast?.issues.length)
      .map((r) => ({ path: r.path, width: r.width, issues: r.contrast.issues })),
  }),
);
if (phase === "after" && failures.length) process.exitCode = 1;
