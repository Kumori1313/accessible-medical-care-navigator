import { expect, test, type Page } from "@playwright/test";
import { expectNoViolations, seedPreferences } from "./helpers";

/** Replace the microphone with one that "hears" a fixed sentence, and record what gets spoken. */
async function fakeVoice(page: Page, heard: string) {
  await page.addInitScript((sentence) => {
    const w = window as unknown as Record<string, unknown>;
    class FakeRecognition {
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      lang = "";
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      start() {
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ isFinal: true, 0: { transcript: sentence } }],
          });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    // Chromium has both names; the app prefers the unprefixed one, so replace both.
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
    const spoken: string[] = [];
    (w as { __spoken: string[] }).__spoken = spoken;
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      spoken.push(u.text);
    };
  }, heard);
}

for (const scheme of ["light", "dark"] as const) {
  test(`ask questions about a sample with the server unreachable (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const apiCalls: string[] = [];
    await page.route("**/api/**", (route) => {
      apiCalls.push(route.request().url());
      return route.abort("failed");
    });
    await seedPreferences(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Insurance statement/ }).click();
    await page.getByRole("button", { name: "Explain this document" }).click();
    await expect(
      page.getByRole("heading", { name: "Ask a question" }),
    ).toBeVisible();
    await expectNoViolations(page);

    // A suggested question.
    await page.getByRole("button", { name: "How much do I owe?" }).click();
    await expect(page.getByRole("heading", { name: "Answer" })).toBeVisible();
    await expect(page.getByText("$35.00").first()).toBeVisible();
    await expect(page.locator("mark")).toContainText("What You Owe");
    await expectNoViolations(page);

    // The same thing in the user's own words, typed.
    await page.getByLabel("Your question").fill("what number do I call?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText("1-800-123-4567").first()).toBeVisible();

    // A question the sample cannot answer offline fails politely and does not crash.
    await page
      .getByLabel("Your question")
      .fill("what is the weather tomorrow?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("suggested questions");
    await expectNoViolations(page);

    expect(apiCalls.filter((u) => !u.endsWith("/ask"))).toEqual([]);
  });
}

test("a spoken question is answered out loud, and typing is never required", async ({
  page,
}) => {
  await fakeVoice(page, "how much do I owe");
  await page.route("**/api/**", (route) => route.abort("failed"));
  await seedPreferences(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Insurance statement/ }).click();
  await page.getByRole("button", { name: "Explain this document" }).click();

  await expect(
    page.getByText(/may send what you say to its own speech service/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Speak your question" }).click();

  await expect(page.getByRole("heading", { name: "Answer" })).toBeVisible();
  await expect(page.getByLabel("Your question")).toHaveValue(
    "how much do I owe",
  );
  await expect(page.locator("mark")).toContainText("What You Owe");
  const spoken = await page.evaluate(
    () => (window as unknown as { __spoken: string[] }).__spoken,
  );
  expect(spoken.join(" ")).toContain("$35.00");
  await expectNoViolations(page);
});

test("the panel is keyboard operable and reflows at 320px with the largest text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route("**/api/**", (route) => route.abort("failed"));
  await seedPreferences(page, { fontScale: 2 });
  await page.goto("/");
  await page.getByRole("button", { name: /Insurance statement/ }).click();
  await page.getByRole("button", { name: "Explain this document" }).click();
  await page.getByLabel("Your question").fill("is this a bill?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Answer" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
