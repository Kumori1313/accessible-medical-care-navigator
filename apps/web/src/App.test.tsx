// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "./App";

it("renders a main landmark and heading", () => {
  render(<App />);
  expect(screen.getByRole("main")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
});
