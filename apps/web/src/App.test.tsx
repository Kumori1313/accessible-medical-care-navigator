// @vitest-environment jsdom
import {
  type Api,
  createPreferencesStore,
  defaultPreferences,
} from "@amcn/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { expect, it, vi } from "vitest";
import { App } from "./App";

const fakeApi = (over: Partial<Api> = {}): Api => ({
  ocr: vi.fn().mockResolvedValue({
    text: "Name: ____\nList medications",
    confidence: 62,
    low_confidence: true,
  }),
  redact: vi
    .fn()
    .mockResolvedValue({ text: "Name: ____\nList medications", counts: {} }),
  explain: vi.fn().mockResolvedValue({
    document_type: "Intake form",
    summary: "Collects patient details.",
    sections: [
      {
        title: "Medications",
        what_it_asks: "List what you take.",
        required: true,
        quote: "List medications",
      },
    ],
    uncertain: [],
  }),
  ask: vi.fn().mockResolvedValue({ answer: "ok", found: true, quote: "" }),
  ...over,
});

const memoryStore = (onboarded: boolean) => {
  const data = new Map<string, string>();
  const store = createPreferencesStore({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  });
  if (onboarded) store.save(defaultPreferences);
  return store;
};

const upload = async (container: HTMLElement) => {
  const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
  await userEvent.upload(
    input,
    new File(["x"], "form.png", { type: "image/png" }),
  );
};

it("walks from upload to a side-by-side explanation, moving focus each step", async () => {
  const { container } = render(
    <App api={fakeApi()} store={memoryStore(true)} />,
  );
  expect(screen.getByRole("main")).toBeInTheDocument();
  await upload(container);

  const review = await screen.findByRole("heading", {
    name: "Check the text we read",
  });
  expect(review).toHaveFocus();
  expect(screen.getByText(/Reading quality: low/)).toBeInTheDocument();

  await userEvent.click(
    screen.getByRole("button", { name: "Explain this document" }),
  );
  const done = await screen.findByRole("heading", { name: "Intake form" });
  expect(done).toHaveFocus();
  expect(screen.getByRole("note")).toHaveTextContent(/Check with the clinic/);
  expect(
    screen.getByRole("region", { name: "Original document text" }),
  ).toBeInTheDocument();
  expect((await axe(container)).violations).toEqual([]);
});

it("announces errors with role=alert and stays on the same step", async () => {
  const { ApiError } = await import("@amcn/core");
  const api = fakeApi({
    ocr: vi.fn().mockRejectedValue(new ApiError("File is too large.", 413)),
  });
  const { container } = render(<App api={api} store={memoryStore(true)} />);
  await upload(container);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "File is too large.",
  );
  expect(
    screen.getByRole("heading", { name: "Understand my paperwork" }),
  ).toBeInTheDocument();
});

it("first run: onboarding previews and saves choices, then shows the app", async () => {
  const store = memoryStore(false);
  const { container } = render(<App api={fakeApi()} store={store} />);
  expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
  expect((await axe(container)).violations).toEqual([]);

  await userEvent.click(screen.getByLabelText(/Small text is hard/));
  expect(document.documentElement.dataset.theme).toBe("high-contrast");
  expect(
    document.documentElement.style.getPropertyValue("--amcn-font-scale"),
  ).toBe("1.5");

  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    screen.getByRole("heading", { name: "Understand my paperwork" }),
  ).toBeInTheDocument();
  expect(store.load()).toMatchObject({
    onboarded: true,
    preferences: { theme: "high-contrast", fontScale: 1.5 },
  });
});

it("skipping onboarding keeps defaults and does not ask again", async () => {
  const store = memoryStore(false);
  const { unmount } = render(<App api={fakeApi()} store={store} />);
  await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  expect(
    screen.getByRole("heading", { name: "Understand my paperwork" }),
  ).toBeInTheDocument();
  unmount();
  render(<App api={fakeApi()} store={store} />);
  expect(
    screen.queryByRole("heading", { name: "Welcome" }),
  ).not.toBeInTheDocument();
});

it("settings apply immediately, persist, and return to where the user was", async () => {
  const store = memoryStore(true);
  const { container } = render(<App api={fakeApi()} store={store} />);
  await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  const heading = screen.getByRole("heading", { name: "Settings" });
  expect(heading).toHaveFocus();
  expect((await axe(container)).violations).toEqual([]);

  await userEvent.selectOptions(screen.getByLabelText("Text size"), "1.5");
  await userEvent.selectOptions(screen.getByLabelText("Colors"), "dark");
  await userEvent.click(screen.getByLabelText(/One-handed layout/));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.documentElement.dataset.oneHanded).toBe("true");
  expect(store.load().preferences).toMatchObject({
    fontScale: 1.5,
    theme: "dark",
    oneHanded: true,
  });

  await userEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(
    screen.getByRole("heading", { name: "Understand my paperwork" }),
  ).toHaveFocus();
});
