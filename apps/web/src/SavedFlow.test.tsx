// @vitest-environment jsdom
import {
  type Api,
  createMemoryStorage,
  createPreferencesStore,
  createVault,
  defaultPreferences,
} from "@amcn/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { expect, it, vi } from "vitest";
import { App } from "./App";

const PASS = "correct horse battery staple";

const api: Api = {
  ocr: vi.fn().mockResolvedValue({
    text: "Name: ____\nList medications",
    confidence: 90,
    low_confidence: false,
  }),
  redact: vi.fn(),
  ask: vi.fn(),
  explain: vi.fn().mockResolvedValue({
    document_type: "Intake form",
    summary: "Collects patient details.",
    sections: [
      {
        title: "Medications",
        what_it_asks: "List them.",
        required: true,
        quote: "List medications",
      },
    ],
    uncertain: [],
  }),
};

function setup(storage = createMemoryStorage()) {
  const data = new Map<string, string>();
  const store = createPreferencesStore({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  });
  store.save(defaultPreferences);
  const vault = createVault(storage, { iterations: 1000 });
  const view = render(<App api={api} store={store} vault={vault} />);
  return { ...view, storage, vault };
}

async function reachExplanation(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
  await userEvent.upload(
    input,
    new File(["x"], "f.png", { type: "image/png" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Explain this document" }),
  );
  await screen.findByRole("heading", { name: "Intake form" });
}

const fill = async (label: string | RegExp, value: string) =>
  userEvent.type(screen.getByLabelText(label), value);

it("set up → recovery key → document saved automatically → lock → unlock → open → delete", async () => {
  const { container, storage } = setup();
  await reachExplanation(container);

  // Saving asks to set up first, and keeps the document waiting.
  await userEvent.click(
    screen.getByRole("button", { name: "Save this document" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Saved documents" }),
  ).toHaveFocus();
  expect(screen.getByRole("note")).toHaveTextContent(/set up saving/);
  expect((await axe(container)).violations).toEqual([]);

  await fill("Choose a passphrase", PASS);
  await fill("Type it again", PASS);
  await userEvent.click(screen.getByRole("button", { name: "Set up saving" }));

  // The recovery key is shown and must be acknowledged.
  const recovery = await screen.findByRole("heading", {
    name: "Keep your recovery key",
  });
  expect(recovery).toHaveFocus();
  expect(
    (screen.getByLabelText("Recovery key") as HTMLInputElement).value,
  ).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  const done = screen.getByRole("button", { name: "Continue" });
  expect(done).toBeDisabled();
  await userEvent.click(screen.getByLabelText(/I have saved my recovery key/));
  expect((await axe(container)).violations).toEqual([]);
  await userEvent.click(done);

  // The waiting document was saved without asking again, and nothing readable hit storage.
  expect(
    await within(await screen.findByRole("list")).findByText(/Intake form \(/),
  ).toBeInTheDocument();
  expect(storage.dump()).not.toContain("medications");

  await userEvent.click(screen.getByRole("button", { name: "Lock now" }));
  await fill("Passphrase", "not the passphrase");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/didn't work/);
  await userEvent.clear(screen.getByLabelText("Passphrase"));
  await fill("Passphrase", PASS);
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

  const list = await screen.findByRole("list");
  await userEvent.click(within(list).getByRole("button", { name: "Open" }));
  expect(
    await screen.findByRole("heading", { name: "Intake form" }),
  ).toHaveFocus();
  expect(
    screen.queryByRole("button", { name: "Save this document" }),
  ).not.toBeInTheDocument();

  await userEvent.click(
    screen.getByRole("button", { name: "Saved documents" }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  expect(
    screen.getByRole("group", { name: /Delete “Intake form/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
  expect(await screen.findByText(/Nothing saved yet/)).toBeInTheDocument();
});

it("forgotten passphrase: recovery key restores access to saved documents", async () => {
  const storage = createMemoryStorage();
  const first = createVault(storage, { iterations: 1000 });
  const { recoveryKey } = await first.create(PASS);
  await first.save({
    title: "Old bill",
    text: "t",
    explanation: {
      document_type: "Bill",
      summary: "s",
      sections: [],
      uncertain: [],
    },
  });
  first.lock();

  setup(storage);
  await userEvent.click(
    screen.getByRole("button", { name: "Saved documents" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "I forgot my passphrase" }),
  );
  await fill("Recovery key", "wrong");
  await fill("New passphrase", "a brand new passphrase");
  await userEvent.click(
    screen.getByRole("button", { name: "Unlock with recovery key" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/recovery key/);

  await userEvent.clear(screen.getByLabelText("Recovery key"));
  await fill("Recovery key", recoveryKey.toLowerCase());
  await userEvent.click(
    screen.getByRole("button", { name: "Unlock with recovery key" }),
  );
  expect(await screen.findByText("Old bill")).toBeInTheDocument();
});

it("mismatched passphrases are caught before anything is created", async () => {
  const { vault } = setup();
  await userEvent.click(
    screen.getByRole("button", { name: "Saved documents" }),
  );
  await fill("Choose a passphrase", PASS);
  await fill("Type it again", PASS + "x");
  await userEvent.click(screen.getByRole("button", { name: "Set up saving" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/don't match/);
  expect(await vault.exists()).toBe(false);
});

it("short passphrases are rejected with guidance", async () => {
  setup();
  await userEvent.click(
    screen.getByRole("button", { name: "Saved documents" }),
  );
  await fill("Choose a passphrase", "short");
  await fill("Type it again", "short");
  await userEvent.click(screen.getByRole("button", { name: "Set up saving" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /at least 12 characters/,
  );
});

it("erasing everything is a two-step action and returns to setup", async () => {
  const storage = createMemoryStorage();
  await createVault(storage, { iterations: 1000 }).create(PASS);
  setup(storage);
  await userEvent.click(
    screen.getByRole("button", { name: "Saved documents" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Erase all saved documents" }),
  );
  expect(await storage.getMeta()).toBeDefined();
  await userEvent.click(
    screen.getByRole("button", { name: "Yes, erase everything" }),
  );
  expect(
    await screen.findByRole("button", { name: "Set up saving" }),
  ).toBeInTheDocument();
  expect(await storage.getMeta()).toBeUndefined();
});

it("locks itself after inactivity and says why", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const storage = createMemoryStorage();
    await createVault(storage, { iterations: 1000 }).create(PASS);
    const data = new Map<string, string>();
    const store = createPreferencesStore({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    });
    store.save({ ...defaultPreferences, autoLockMinutes: 5 });
    render(
      <App
        api={api}
        store={store}
        vault={createVault(storage, { iterations: 1000 })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Saved documents" }),
    );
    await fill("Passphrase", PASS);
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByRole("button", { name: "Lock now" });
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
    expect(await screen.findByText(/locked after a while/)).toBeInTheDocument();
    expect(screen.getByLabelText("Passphrase")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
