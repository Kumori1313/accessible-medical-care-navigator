import type { Ref } from "react";
import { Button as AriaButton, type ButtonProps } from "react-aria-components";

/** Accessible button: keyboard, focus ring and press handling come from React Aria. */
export function Button(props: ButtonProps & { ref?: Ref<HTMLButtonElement> }) {
  return <AriaButton {...props} className="amcn-button" />;
}
