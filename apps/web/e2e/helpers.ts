import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
}

/** Skip onboarding by pre-seeding saved preferences (what a returning user has). */
export async function seedPreferences(
  page: Page,
  prefs: Record<string, unknown> = {},
) {
  await page.addInitScript((value) => {
    window.localStorage.setItem("amcn.preferences.v1", JSON.stringify(value));
  }, prefs);
}
