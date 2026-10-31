import { expect, test } from "@playwright/test";
import { expectNoViolations, seedPreferences } from "./helpers";

for (const scheme of ["light", "dark"] as const) {
  test(`upload → review → explanation has no axe violations (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.route("**/api/ocr", (r) =>
      r.fulfill({
        json: {
          text: "Name: ____\nList medications (required)",
          confidence: 64,
          low_confidence: true,
        },
      }),
    );
    await page.route("**/api/explain", (r) =>
      r.fulfill({
        json: {
          document_type: "Intake form",
          summary: "Collects basic patient details.",
          sections: [
            {
              title: "Medications",
              what_it_asks: "List what you take.",
              required: true,
              quote: "List medications (required)",
            },
          ],
          uncertain: ["The handwriting in the top corner."],
        },
      }),
    );

    await seedPreferences(page);
    await page.goto("/");
    await expectNoViolations(page);

    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "form.png",
        mimeType: "image/png",
        buffer: Buffer.from("x"),
      });
    await expect(
      page.getByRole("heading", { name: "Check the text we read" }),
    ).toBeFocused();
    await expectNoViolations(page);

    await page.getByRole("button", { name: "Explain this document" }).click();
    await expect(
      page.getByRole("heading", { name: "Intake form" }),
    ).toBeFocused();
    await expect(page.locator("mark")).toHaveText(
      "List medications (required)",
    );
    await expectNoViolations(page);
  });
}

test("is fully operable by keyboard from the start", async ({ page }) => {
  await seedPreferences(page);
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  // Settings sits in the header before the content; the skip link lets users bypass it.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Take a photo" }),
  ).toBeFocused();
});
