import { expect, test } from "@playwright/test";
import { expectNoViolations, seedPreferences } from "./helpers";

for (const scheme of ["light", "dark"] as const) {
  test(`sample documents work with the server unreachable (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    // Any call to the API fails, as it would with no wifi or no backend.
    const apiCalls: string[] = [];
    await page.route("**/api/**", (route) => {
      apiCalls.push(route.request().url());
      return route.abort("failed");
    });
    await seedPreferences(page);
    await page.goto("/");
    await expectNoViolations(page);

    await page.getByRole("button", { name: /Insurance statement/ }).click();
    await expect(
      page.getByRole("heading", { name: "Check the text we read" }),
    ).toBeFocused();
    await expectNoViolations(page);

    await page.getByRole("button", { name: "Explain this document" }).click();
    await expect(
      page.getByRole("heading", { name: /Explanation of Benefits/ }),
    ).toBeFocused();
    await page.getByRole("button", { name: "What you owe" }).click();
    await expect(page.locator("mark")).toContainText("What You Owe");
    await expectNoViolations(page);

    expect(apiCalls).toEqual([]);
  });
}

test("a sample can be read aloud and every sample explains", async ({
  page,
}) => {
  await seedPreferences(page);
  await page.goto("/");
  for (const name of [/Permission form/, /Health handout/]) {
    await page.getByRole("button", { name }).click();
    await page.getByRole("button", { name: "Explain this document" }).click();
    await expect(
      page.getByRole("button", { name: "Read aloud" }),
    ).toBeVisible();
    await expectNoViolations(page);
    await page.getByRole("button", { name: "Start over" }).click();
  }
});
