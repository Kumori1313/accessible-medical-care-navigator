import { expect, test } from "@playwright/test";
import { expectNoViolations, seedPreferences } from "./helpers";

test("manifest is valid and its icons load", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({
    display: "standalone",
    start_url: "/",
    lang: "en",
  });
  const purposes = manifest.icons.map(
    (i: { purpose?: string }) => i.purpose ?? "any",
  );
  expect(purposes).toContain("maskable");
  for (const icon of manifest.icons) {
    expect((await request.get(`/${icon.src}`)).ok()).toBe(true);
  }
});

test("app shell works offline, shows an offline notice, and never caches the API", async ({
  page,
  context,
}) => {
  await seedPreferences(page);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Wait until the worker controls the page (first load is uncontrolled until it claims clients).
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Understand my paperwork" }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toContainText("You are offline");
  await expectNoViolations(page);

  // An API call while offline fails with a readable message instead of a stale cached answer.
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "form.png",
      mimeType: "image/png",
      buffer: Buffer.from("x"),
    });
  await expect(page.getByRole("alert")).toContainText(
    "Could not reach the service",
  );

  const cachedApiRequests = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys())
        urls.push(req.url);
    }
    return urls.filter((u) => new URL(u).pathname.startsWith("/api"));
  });
  expect(cachedApiRequests).toEqual([]);
});
