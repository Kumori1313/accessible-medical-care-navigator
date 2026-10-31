import { describe, expect, it } from "vitest";
import { ApiError, createApi } from "./api";

const reply = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("createApi", () => {
  it("returns parsed JSON", async () => {
    const api = createApi("/x", reply(200, { text: "hi", counts: {} }));
    expect(await api.redact("hi")).toEqual({ text: "hi", counts: {} });
  });
  it("surfaces the server's detail message", async () => {
    const api = createApi(
      "/x",
      reply(503, { detail: "No model provider configured." }),
    );
    await expect(api.explain("t", "simple")).rejects.toMatchObject({
      message: "No model provider configured.",
      status: 503,
    });
  });
  it("turns network failures into a readable error", async () => {
    const api = createApi("/x", (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    await expect(api.redact("t")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("ask", () => {
  it("posts the document and question and returns the answer", async () => {
    let seen: { url: string; body: string } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, body: String(init.body) };
      return new Response(
        JSON.stringify({
          answer: "$35.00",
          found: true,
          quote: "Total $35.00",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const api = createApi("/x", fetchFn);
    expect(await api.ask("doc text", "How much?")).toEqual({
      answer: "$35.00",
      found: true,
      quote: "Total $35.00",
    });
    expect(seen?.url).toBe("/x/ask");
    expect(JSON.parse(seen?.body ?? "")).toEqual({
      text: "doc text",
      question: "How much?",
    });
  });
});
