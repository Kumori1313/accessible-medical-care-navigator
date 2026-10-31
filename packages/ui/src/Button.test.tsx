// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { expect, it, vi } from "vitest";
import { Button } from "./Button";

it("has no axe violations and is operable by keyboard", async () => {
  const onPress = vi.fn();
  const { container } = render(<Button onPress={onPress}>Save</Button>);
  expect((await axe(container)).violations).toEqual([]);
  await userEvent.tab();
  expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(onPress).toHaveBeenCalledOnce();
});
