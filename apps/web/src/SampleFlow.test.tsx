// @vitest-environment jsdom
import {
  type Api,
  createMemoryStorage,
  createPreferencesStore,
  createVault,
  defaultPreferences,
} from "@amcn/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { DEMO_SAMPLES } from "./demo/samples";

/** An API that fails the test if anything calls it: samples must work with no server. */
const forbiddenApi = (): Api => ({
  ocr: vi.fn(() =>
    Promise.reject(new Error("ocr must not be called for samples")),
  ),
  redact: vi.fn(() =>
    Promise.reject(new Error("redact must not be called for samples")),
  ),
  explain: vi.fn(() =>
    Promise.reject(new Error("explain must not be called for samples")),
  ),
});

function setup(api = forbiddenApi()) {
  const data = new Map<string, string>();
  const store = createPreferencesStore({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  });
  store.save(defaultPreferences);
  const vault = createVault(createMemoryStorage(), { iterations: 1000 });
  return { api, ...render(<App api={api} store={store} vault={vault} />) };
}

it("lists the samples on the first screen", () => {
  setup();
  for (const s of DEMO_SAMPLES)
    expect(screen.getByRole("button", { name: s.title })).toBeInTheDocument();
});

it("walks a sample from start to explanation without touching the server", async () => {
  const { api, container } = setup();
  await userEvent.click(
    screen.getByRole("button", { name: /Insurance statement/ }),
  );

  expect(
    await screen.findByRole("heading", { name: "Check the text we read" }),
  ).toHaveFocus();
  expect(screen.getByRole("note")).toHaveTextContent(/Sample document/);
  expect(
    screen.queryByRole("button", { name: "Remove personal details" }),
  ).not.toBeInTheDocument();
  expect(
    (screen.getByLabelText(/Document text/) as HTMLTextAreaElement).value,
  ).toContain("THIS IS NOT A BILL");

  await userEvent.click(
    screen.getByRole("button", { name: "Explain this document" }),
  );
  expect(
    await screen.findByRole("heading", { name: /Explanation of Benefits/ }),
  ).toHaveFocus();
  expect(screen.getByText(/Pre-written sample/)).toBeInTheDocument();
  expect(screen.getByText(/Check with the clinic/)).toBeInTheDocument();

  // Choosing a section highlights its quote in the original text.
  await userEvent.click(screen.getByRole("button", { name: "What you owe" }));
  expect(container.querySelector("mark")?.textContent).toContain(
    "What You Owe",
  );

  expect((await axe(container)).violations).toEqual([]);
  for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
});

it("start over clears the sample labels", async () => {
  setup();
  await userEvent.click(
    screen.getByRole("button", { name: /Permission form/ }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Start over" }));
  expect(
    screen.getByRole("heading", { name: "Understand my paperwork" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Health handout/ }));
  expect(screen.getByRole("note")).toHaveTextContent(
    /Centers for Disease Control/,
  );
});

it("if the user edits a sample's text, the real service is used instead of the canned answer", async () => {
  const api = forbiddenApi();
  api.explain = vi.fn().mockResolvedValue({
    document_type: "Edited",
    summary: "A live answer.",
    sections: [],
    uncertain: [],
  });
  setup(api);
  await userEvent.click(
    screen.getByRole("button", { name: /Insurance statement/ }),
  );
  await userEvent.type(screen.getByLabelText(/Document text/), " extra words");
  await userEvent.click(
    screen.getByRole("button", { name: "Explain this document" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Edited" }),
  ).toBeInTheDocument();
  expect(api.explain).toHaveBeenCalledOnce();
  expect(screen.queryByText(/Pre-written sample/)).not.toBeInTheDocument();
});
