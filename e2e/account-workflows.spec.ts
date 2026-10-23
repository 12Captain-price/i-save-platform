import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

// Opt in only to the named disposable stack. No screenshots, traces or links.
test("isolated browser/API/PostgreSQL staff invitation, recovery and notification lifecycle", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.ISAVE_ACCOUNTS_REHEARSAL !== "1",
    "Opt-in isolated PostgreSQL/Mailpit flow",
  );
  test.setTimeout(120000);
  const password = randomBytes(24).toString("base64url"),
    replacement = randomBytes(24).toString("base64url");
  const seed = `import json,sys\nfrom sqlalchemy.orm import Session\nfrom app.database import engine\nfrom app.bootstrap import bootstrap\nfrom app.models.user import User\nfrom app.models.role import Role\nfrom app.security.hashing import hash_password\nfrom app.services.account_workflows import notify\nassert engine.url.host=='db' and engine.url.database=='isave_test_browser'\np=json.loads(sys.stdin.readline())['password']\nwith Session(engine) as db:\n if db.query(User).count(): sys.exit(0)\n admin=bootstrap(db,'accounts-admin@example.test',p)\n member=User(email='accounts-member@example.test',password_hash=hash_password(p),is_active=True,role_id=db.query(Role).filter_by(name='member').one().id)\n db.add(member);db.flush();notify(db,member.id,'synthetic-notice','TEST ONLY completed account update.','dashboard');db.commit()\n`;
  // Python source and password travel over stdin, never a process argument/log.
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "isave-accounts-rehearsal-backend-1",
      "python",
      "-c",
      "import sys; s=sys.stdin.readline(); exec(compile(bytes.fromhex(s).decode(),'private-test','exec'))",
    ],
    {
      input: Buffer.from(seed).toString("hex") + "\n" + JSON.stringify({ password }) + "\n",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  async function privateRecovery(email:string){
    const headers={Origin:'http://127.0.0.1:13060','X-Isave-Request':'1'};
    const seen=new Set((await(await request.get('http://127.0.0.1:18025/api/v1/messages')).json()).messages.map((m:{ID:string})=>m.ID));
    const key=randomUUID();
    expect((await request.post('/api/auth/recovery',{headers,data:{email,request_key:key}})).status()).toBe(202);
    let text='';
    await expect.poll(async()=>{const list=await(await request.get('http://127.0.0.1:18025/api/v1/messages')).json();for(const item of list.messages){if(seen.has(item.ID)||!item.Subject.includes('recovery'))continue;const m=await(await request.get('http://127.0.0.1:18025/api/v1/message/'+item.ID)).json();if(m.To.some((t:{Address:string})=>t.Address===email)){text=m.Text;return true;}}return false;},{timeout:30000}).toBe(true);
    const token=text.split('#token=')[1]?.slice(0,43);expect(Boolean(token)).toBe(true);
    expect((await request.post('/api/auth/reset-password',{headers,data:{token,password}})).status()).toBe(204);
  }
  await privateRecovery('accounts-admin@example.test');
  await privateRecovery('accounts-member@example.test');
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("accounts-admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/portal/admin/dashboard");
  await page.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invite operational staff" })).toBeVisible();
  await expect(page.getByRole('button',{name:'Refresh staff'})).toBeEnabled();
  const existing=page.getByRole('heading',{name:'accounts-staff@example.test',exact:true});
  const alreadyActive=Boolean(await existing.count())&&Boolean(await existing.locator('..').getByText(/^staff . Active$/).count());
  if(!alreadyActive){
  if(await existing.count())await existing.locator('..').getByRole('button',{name:'Replace invitation and revoke prior link'}).click();
  else {await page.getByLabel('Email address',{exact:true}).fill('accounts-staff@example.test');await page.getByRole('button',{name:'Invite staff',exact:true}).click();}
  await expect(page.getByText(/Invitation recorded: Mailpit accepted/)).toBeVisible();
  const messages = await request.get("http://127.0.0.1:18025/api/v1/messages");
  const list = await messages.json();
  const entry = list.messages.find((m: { To: { Address: string }[] }) =>
    m.To.some((x) => x.Address === "accounts-staff@example.test"),
  );
  expect(Boolean(entry)).toBe(true);
  const message = await (
    await request.get("http://127.0.0.1:18025/api/v1/message/" + entry.ID)
  ).json();
  const match = message.Text.match(
    /http:\/\/127\.0\.0\.1:13060\/setup-password#token=[A-Za-z0-9_-]{43}/,
  );
  expect(Boolean(match)).toBe(true);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL("**/login");
  // Avoid assertions that would render private URL/token as failure output.
  await page.goto(match[0]);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Password set", exact: true })).toBeVisible();
  const token = match[0].split("#token=")[1];
  const reused = await request.post("/api/auth/setup-password", {
    headers: { Origin: "http://127.0.0.1:13060", "X-Isave-Request": "1" },
    data: { token, password },
  });
  expect(reused.status()).toBe(400);
  }else{await page.getByRole('button',{name:'Log out',exact:true}).click();await page.waitForURL('**/login');}
  const priorRecovery=new Set((await(await request.get('http://127.0.0.1:18025/api/v1/messages')).json()).messages.map((m:{ID:string})=>m.ID));
  await page.goto("/recovery");
  await page.getByLabel("Email address", { exact: true }).fill("accounts-staff@example.test");
  await page.getByRole("button", { name: "Request recovery link" }).click();
  await expect(page.getByRole("status")).toContainText("If recovery is available");
  let recoveryText = "";
  await expect
    .poll(async () => {
      const items = await (await request.get("http://127.0.0.1:18025/api/v1/messages")).json();
      for (const item of items.messages) {
        if (priorRecovery.has(item.ID)||!item.Subject.includes("recovery")) continue;
        const detail = await (
          await request.get("http://127.0.0.1:18025/api/v1/message/" + item.ID)
        ).json();
        if (
          detail.To.some((t: { Address: string }) => t.Address === "accounts-staff@example.test")
        ) {
          recoveryText = detail.Text;
          return true;
        }
      }
      return false;
    },{timeout:30000})
    .toBe(true);
  const reset = recoveryText.match(/http:\/\/127\.0\.0\.1:13060\/recovery#token=[A-Za-z0-9_-]{43}/);
  expect(Boolean(reset)).toBe(true);
  await page.goto(reset![0]);
  await page.getByLabel("New password", { exact: true }).fill(replacement);
  await page.getByLabel("Confirm password", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Password set", exact: true })).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("accounts-member@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/portal/member/dashboard");
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  const before=(await(await page.request.get('/api/notifications')).json()).unread;
  await page.getByRole('article').filter({hasText:'TEST ONLY completed account update.'}).getByRole('button',{name:'Mark read'}).click();
  await expect(page.getByRole('heading',{name:(before-1)+' unread notifications'})).toBeVisible();
  expect((await page.request.get("/api/admin/staff")).status()).toBe(403);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL("**/login");
  expect((await page.request.get("/api/notifications")).status()).toBe(401);
});

for (const width of [390, 1280])
  test(`notification centre layout and keyboard controls ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let read = false;
    await page.route("**/api/**", async (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === "/api/auth/me")
        return route.fulfill({
          json: {
            user: { id: 9, email: "layout@example.test", is_active: true, role_id: 9 },
            workspace: "member",
            permissions: ["members:own"],
          },
        });
      if (p === "/api/notifications/1") {
        read = route.request().postDataJSON().read;
        return route.fulfill({ json: { read } });
      }
      if (p === "/api/notifications")
        return route.fulfill({
          json: {
            unread: read ? 0 : 1,
            total: 1,
            items: [
              {
                id: 1,
                message: "TEST ONLY completed event.",
                read,
                created_at: "2026-10-23T00:00:00Z",
                link: "/portal/member/dashboard",
              },
            ],
          },
        });
      return route.abort();
    });
    await page.goto("/login");
    await page.waitForURL("**/portal/member/dashboard");
    if (width < 500) await page.getByRole("button", { name: "Open portal menu" }).click();
    await page.getByRole("link", { name: "Notifications", exact: true }).click();
    if (width < 500) await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "1 unread notifications" })).toBeVisible();
    const button = page.getByRole("button", { name: "Mark read" });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "0 unread notifications" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
