import { expect, test } from "@playwright/test";
import { expectNoViolations, seedPreferences } from "./helpers";

test("onboarding has no violations and works by keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expectNoViolations(page);
  await page.getByLabel(/Reading long text/).check();
  await expect(page.locator("html")).toHaveAttribute("data-font", "dyslexia");
  await expectNoViolations(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Understand my paperwork" }),
  ).toBeVisible();
});

const THEMES = ["system", "light", "dark", "high-contrast"] as const;

for (const theme of THEMES) {
  test(`home and settings have no violations (${theme}, largest text, wide spacing, one-handed)`, async ({
    page,
  }) => {
    await seedPreferences(page, {
      theme,
      fontScale: 2,
      spacing: "wide",
      oneHanded: true,
      dyslexiaFont: true,
    });
    await page.goto("/");
    await expectNoViolations(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeFocused();
    await expectNoViolations(page);
  });
}

test("no horizontal scroll at largest text size on a phone-sized screen (WCAG 1.4.10)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seedPreferences(page, { fontScale: 2 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
