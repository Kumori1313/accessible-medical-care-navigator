import { Button } from "@amcn/ui";
import { useEffect, useRef, useState } from "react";

/** Two-step destructive action: the first press asks, the second does it. Easy to back out of. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  isDisabled,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  isDisabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  // The pressed button disappears, so move focus to the safe choice instead of dropping it.
  useEffect(() => {
    if (asking) cancel.current?.focus();
  }, [asking]);
  if (!asking) {
    return (
      <Button onPress={() => setAsking(true)} isDisabled={isDisabled}>
        {label}
      </Button>
    );
  }
  return (
    <span role="group" aria-label={question}>
      <strong>{question}</strong>{" "}
      {/* Cancel first so a stray double-press cannot destroy anything. */}
      <Button ref={cancel} onPress={() => setAsking(false)}>
        Cancel
      </Button>{" "}
      <Button
        onPress={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
    </span>
  );
}
