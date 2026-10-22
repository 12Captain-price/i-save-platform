import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { textContrast } from "../scripts/text-contrast.mjs";
const origin = process.env.ISAVE_E2E_ORIGIN ?? "http://127.0.0.1:13000";
const output = process.env.ISAVE_E2E_EVIDENCE_DIR ?? "docs/savings-contributions/browser";
if (/docs\/(homepage-redesign|ui-activation|ui-review)(\/|$)/.test(output.replaceAll('\\','/')))
  throw new Error('Protected local evidence directory cannot be used as browser-test output');
mkdirSync(output, { recursive: true });
for (const width of [360, 390, 768, 1440, 1920])
  test(`homepage ${width}px: content, layout, contrast and destinations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const hero = page.getByRole("region", { name: "Save for what matters to you." });
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("link", { name: "Explore savings goals" })).toHaveAttribute(
      "href",
      "#goals",
    );
    await expect(hero.getByRole("link", { name: "Apply for membership" })).toHaveAttribute(
      "href",
      "/register",
    );
    await expect(hero.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("[data-sequence-bar]")).toHaveCount(8);
    const goals = page.getByRole("region", { name: "What are you saving for?" });
    await expect(goals.getByRole("link")).toHaveCount(5);
    for (const slug of ["asset", "holiday", "emergency", "retrenchment", "education"])
      expect(await goals.locator(`a[href="/plans/${slug}-savings"]`).count()).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const link of await hero.getByRole("link").all()) {
      const box = await link.boundingBox();
      if (!/Log in/.test(await link.innerText())) expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const contrast = await page.evaluate(textContrast);
    expect(contrast.issues).toEqual([]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${output}/home-${width}.png`, fullPage: true });
    if ([390, 1440, 1920].includes(width))
      await page.screenshot({ path: `${output}/home-${width}-viewport.png` });
    const height = await page.locator("body").evaluate((body) => body.scrollHeight);
    if (width === 390) expect(height).toBeLessThanOrEqual(4120);
    await hero.getByRole("link", { name: "Explore savings goals" }).click();
    await expect(page).toHaveURL(/#goals$/);
  });
test("category details, application and login are real destinations; shared shells remain usable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Asset — Explore this category" }).click();
  await expect(page).toHaveURL(/\/plans\/asset-savings$/);
  await expect(page.getByRole("heading", { name: "Asset savings" })).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("region", { name: "Save for what matters to you." })
    .getByRole("link", { name: "Apply for membership" })
    .click();
  await expect(page.getByLabel("First name (required)")).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("region", { name: "Save for what matters to you." })
    .getByRole("link", { name: "Log in" })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  for (const path of ["/how-it-works", "/fees", "/contact", "/plans", "/login"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const menu = page.getByRole("button", { name: "Open menu" });
    await menu.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await expect(page.getByRole("navigation", { name: "Footer", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (["/how-it-works", "/contact"].includes(path))
      await page.screenshot({ path: `${output}/shared-${path.slice(1)}-390.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(
      page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link"),
    ).toHaveCount(5);
  }
});
test("keyboard skip link, focus and mobile menu are available ahead of the illustration", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const action = page
    .getByRole("region", { name: "Save for what matters to you." })
    .getByRole("link", { name: "Explore savings goals" });
  await action.focus();
  expect(
    await action.evaluate(
      (el) =>
        getComputedStyle(el).outlineStyle !== "none" || getComputedStyle(el).boxShadow !== "none",
    ),
  ).toBe(true);
  expect((await action.boundingBox())!.y).toBeLessThan(
    (await page.locator(".chapter-art").boundingBox())!.y,
  );
});
test("visible illustration plays once, reserves its dimensions and keeps the counter decorative", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/");
  await page.waitForTimeout(600);
  const art = page.locator(".chapter-art");
  const initial = await art.boundingBox();
  await art.scrollIntoViewIfNeeded();
  await expect(art).toHaveAttribute("data-animate", "true");
  await expect(art).toHaveAttribute("data-animate", "false", { timeout: 5000 });
  await expect(page.locator(".chapter-counter")).toHaveText("Step 08");
  expect(await art.getAttribute("aria-hidden")).toBe("true");
  expect(await art.locator("[aria-live]").count()).toBe(0);
  const complete = await art.boundingBox();
  expect(complete?.height).toBe(initial?.height);
  expect(complete?.width).toBe(initial?.width);
  await page.evaluate(() => scrollTo(0, 0));
  await art.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await expect(art).toHaveAttribute("data-animate", "false");
});
test("reduced motion and disabled JavaScript preserve the completed illustration and essential content", async ({
  browser,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".chapter-art").scrollIntoViewIfNeeded();
  await expect(page.locator(".chapter-counter")).toHaveText("Step 08");
  await expect(page.locator(".chapter-art")).toHaveAttribute("data-animate", "false");
  expect(
    await page
      .locator(".chapter-bar")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  const context = await browser.newContext({
    baseURL: origin,
    javaScriptEnabled: false,
    reducedMotion: "reduce",
  });
  try {
    const noJS = await context.newPage();
    await noJS.goto("/");
    await expect(
      noJS.getByRole("heading", { name: "Save for what matters to you." }),
    ).toBeVisible();
    await expect(noJS.locator("[data-sequence-bar]")).toHaveCount(8);
    await expect(noJS.locator(".chapter-counter")).toHaveText("Step 08");
    await expect(noJS.getByRole("link", { name: "Need a hand? Contact the office" })).toBeVisible();
    expect(
      await noJS
        .locator(".chapter-bar")
        .first()
        .evaluate((el) => getComputedStyle(el).opacity),
    ).toBe("1");
  } finally {
    await context.close();
  }
});
test("published contact values render live, with a visible safe retry on failure", async ({
  page,
}) => {
  const response = await page.request.get("/api/public/contacts");
  expect(response.status()).toBe(200);
  const contacts = await response.json();
  let requests = 0;
  await page.route("**/api/public/contacts", (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 503, body: "Unavailable" })
      : route.fulfill({ json: contacts });
  });
  await page.goto("/");
  await expect(
    page.getByText("Published contact details are temporarily unavailable."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry contacts" }).click();
  await expect(page.getByRole("link", { name: contacts.email, exact: true })).toHaveAttribute(
    "href",
    "mailto:" + contacts.email,
  );
  await expect(
    page.getByRole("link", { name: contacts.office_phone, exact: true }),
  ).toHaveAttribute("href", "tel:+" + contacts.office_phone.replace(/\D/g, ""));
});
test("200% zoom: browser zoom when available, otherwise equivalent desktop reflow", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const before = await page.evaluate(() => innerWidth);
  for (let i = 0; i < 4; i++) await page.keyboard.press("Control+Equal");
  const after = await page.evaluate(() => innerWidth);
  let checked = page,
    context;
  const method =
    after === before / 2
      ? "native browser keyboard zoom"
      : "200% desktop reflow: 720 CSS px at device scale 2 for a 1440px display";
  if (after !== before / 2) {
    context = await browser.newContext({
      baseURL: origin,
      viewport: { width: 720, height: 450 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    checked = await context.newPage();
    await checked.goto("/");
  }
  try {
    await expect(
      checked.getByRole("heading", { name: "Save for what matters to you." }),
    ).toBeVisible();
    expect(await checked.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await checked
      .getByRole("region", { name: "What are you saving for?" })
      .scrollIntoViewIfNeeded();
    await expect(checked.locator(".home-goals li")).toHaveCount(5);
    await checked.screenshot({ path: `${output}/zoom-200.png`, fullPage: true });
    writeFileSync(`${output}/zoom-method.json`, JSON.stringify({ method, before, after }, null, 2));
  } finally {
    await context?.close();
  }
});
