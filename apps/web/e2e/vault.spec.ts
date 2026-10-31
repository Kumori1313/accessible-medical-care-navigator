import { expect, test, type Page } from "@playwright/test";
import { expectNoViolations, seedPreferences } from "./helpers";

const PASS = "correct horse battery staple";
const SECRET_TEXT = "Patient Jane Roe SSN 123-45-6789 list medications";

async function mockApi(page: Page) {
  await page.route("**/api/ocr", (r) =>
    r.fulfill({
      json: { text: SECRET_TEXT, confidence: 95, low_confidence: false },
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
            quote: "list medications",
          },
        ],
        uncertain: [],
      },
    }),
  );
}

/** Everything IndexedDB holds for the vault, as one searchable string (bytes as latin1 text). */
async function rawStorage(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("amcn-vault");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["meta", "docs"]);
          const meta = tx.objectStore("meta").getAll();
          const docs = tx.objectStore("docs").getAll();
          tx.oncomplete = () => {
            const flat = JSON.stringify([meta.result, docs.result], (_k, v) =>
              v instanceof Uint8Array ? String.fromCharCode(...v) : v,
            );
            db.close();
            resolve(flat);
          };
        };
      }),
  );
}

for (const theme of ["light", "high-contrast"] as const) {
  test(`encrypted save, reload, unlock, and raw storage holds no plaintext (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await mockApi(page);
    await seedPreferences(page, { theme, fontScale: 1.5 });
    await page.goto("/");

    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "f.png",
        mimeType: "image/png",
        buffer: Buffer.from("x"),
      });
    await page.getByRole("button", { name: "Explain this document" }).click();
    await page.getByRole("button", { name: "Save this document" }).click();

    await expect(
      page.getByRole("heading", { name: "Saved documents" }),
    ).toBeFocused();
    await expectNoViolations(page);
    await page.getByLabel("Choose a passphrase").fill(PASS);
    await page.getByLabel("Type it again").fill(PASS);
    await page.getByRole("button", { name: "Set up saving" }).click();

    const recovery = page.getByLabel("Recovery key", { exact: true });
    await expect(recovery).toBeVisible();
    const recoveryKey = await recovery.inputValue();
    expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    await expectNoViolations(page);
    await page.getByLabel(/I have saved my recovery key/).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("list").getByText(/Intake form \(/),
    ).toBeVisible();
    await expectNoViolations(page);

    // What is physically stored contains neither the document nor the passphrase nor the recovery key.
    const raw = await rawStorage(page);
    for (const secret of [
      "Jane",
      "123-45-6789",
      "medications",
      "Intake form",
      PASS,
      recoveryKey.replaceAll("-", ""),
    ]) {
      expect(raw).not.toContain(secret);
    }

    // A fresh page load starts locked; the right passphrase brings the document back.
    await page.reload();
    await page.getByRole("button", { name: "Saved documents" }).click();
    await expectNoViolations(page);
    await page.getByLabel("Passphrase").fill("definitely the wrong one");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("alert")).toContainText("didn't work");
    await page.getByLabel("Passphrase").fill(PASS);
    await page.getByRole("button", { name: "Unlock" }).click();
    await page.getByRole("button", { name: "Open" }).click();
    await expect(
      page.getByRole("heading", { name: "Intake form" }),
    ).toBeFocused();
    await expect(page.locator(".amcn-original")).toContainText("Jane Roe");

    // The recovery key works from a locked state.
    await page.getByRole("button", { name: "Saved documents" }).click();
    await page.getByRole("button", { name: "Lock now" }).click();
    await page.getByRole("button", { name: "I forgot my passphrase" }).click();
    await expectNoViolations(page);
    await page
      .getByLabel("Recovery key", { exact: true })
      .fill(recoveryKey.toLowerCase());
    await page.getByLabel("New passphrase").fill("my second long passphrase");
    await page
      .getByRole("button", { name: "Unlock with recovery key" })
      .click();
    await expect(
      page.getByRole("list").getByText(/Intake form \(/),
    ).toBeVisible();
  });
}

test("saved-documents views reflow at 320px with the largest text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seedPreferences(page, { fontScale: 2 });
  await page.goto("/");
  await page.getByRole("button", { name: "Saved documents" }).click();
  await expect(
    page.getByRole("heading", { name: "Saved documents" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
