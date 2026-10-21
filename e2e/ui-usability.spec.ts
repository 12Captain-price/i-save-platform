import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const password = randomBytes(24).toString("base64url");
test("public mobile navigation, skip link, category destinations and approved-content states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  await expect(page.getByRole("navigation", { name: "Mobile", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("link", { name: /Asset.*Explore this category/ }).click();
  await expect(page).toHaveURL(/\/plans\/asset-savings$/);
  await expect(
    page.getByRole("heading", { name: "Plan terms awaiting confirmation" }),
  ).toBeVisible();
  for (const path of ["/team", "/events", "/announcements"]) {
    await page.goto(path);
    await expect(page.getByText("Awaiting approved content")).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(
      /Sample profiles|Sample events|Samantha|David Moyo/,
    );
  }
});
test("admin mobile menu traps focus, closes with Escape and exposes settings sections", async ({
  page,
}) => {
  execFileSync(
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
      `
import json,sys
from sqlalchemy.orm import Session
from app.database import engine
from app.models.user import User
from app.models.role import Role
from app.security.hashing import hash_password
assert engine.url.database=='isave_test_browser'
with Session(engine) as db:
 db.add(User(email='keyboard-admin@example.test',role_id=db.query(Role).filter_by(name='administrator').one().id,is_active=True,password_hash=hash_password(json.load(sys.stdin)['password'])));db.commit()
`,
    ],
    { input: JSON.stringify({ password }), stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("keyboard-admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/portal/admin/dashboard");
  const trigger = page.getByRole("button", { name: "Open portal menu" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(dialog).not.toBeVisible();
  await page.goto("/portal/admin/settings");
  await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Public contacts", exact: true })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Monthly subscription", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "USD-to-ZiG rates", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
