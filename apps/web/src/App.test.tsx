// @vitest-environment jsdom
import type { Api } from "@amcn/core";
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
  ...over,
});

const upload = async (container: HTMLElement) => {
  const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
  await userEvent.upload(
    input,
    new File(["x"], "form.png", { type: "image/png" }),
  );
};

it("walks from upload to a side-by-side explanation, moving focus each step", async () => {
  const { container } = render(<App api={fakeApi()} />);
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
  const { container } = render(<App api={api} />);
  await upload(container);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "File is too large.",
  );
  expect(
    screen.getByRole("heading", { name: "Understand my paperwork" }),
  ).toBeInTheDocument();
});
