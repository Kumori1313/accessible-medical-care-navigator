// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { createVault } from "@amcn/core";
import { expect, it } from "vitest";
import { createIdbStorage } from "./idbStorage";

it("persists an encrypted vault across sessions in IndexedDB", async () => {
  const doc = {
    title: "Letter",
    text: "secret body",
    explanation: {
      document_type: "t",
      summary: "s",
      sections: [],
      uncertain: [],
    },
  };
  const first = createVault(createIdbStorage(), { iterations: 1000 });
  await first.create("a long enough passphrase");
  const id = await first.save(doc);

  const second = createVault(createIdbStorage(), { iterations: 1000 });
  expect(await second.exists()).toBe(true);
  await second.unlock("a long enough passphrase");
  expect(await second.get(id)).toEqual(doc);

  await second.eraseEverything();
  expect(await createVault(createIdbStorage()).exists()).toBe(false);
});
