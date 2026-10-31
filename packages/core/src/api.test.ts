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
