// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { expect, it, vi } from "vitest";
import { PwaNotices } from "./PwaNotices";

const base = {
  online: true,
  updateReady: false,
  offlineReady: false,
  applyUpdate: () => {},
};

it("shows nothing extra when online and up to date", () => {
  render(<PwaNotices {...base} />);
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});

it("explains what still works offline", async () => {
  const { container } = render(<PwaNotices {...base} online={false} />);
  expect(screen.getByRole("note")).toHaveTextContent(/offline/i);
  expect((await axe(container)).violations).toEqual([]);
});

it("lets the user choose when to update", async () => {
  const applyUpdate = vi.fn();
  render(<PwaNotices {...base} updateReady applyUpdate={applyUpdate} />);
  expect(applyUpdate).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Update now" }));
  expect(applyUpdate).toHaveBeenCalledOnce();
});

it("announces offline readiness politely", () => {
  render(<PwaNotices {...base} offlineReady />);
  expect(screen.getByRole("status")).toHaveTextContent(/without a connection/);
});
