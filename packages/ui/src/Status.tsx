import type { ReactNode } from "react";

/** Polite live region: announce progress/results without moving focus. Keep it mounted. */
export function StatusMessage({ children }: { children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="amcn-status">
      {children}
    </div>
  );
}

/** Assertive alert for errors the user must notice. Rendered only when there is an error. */
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="amcn-error">
      {children}
    </div>
  );
}

/** Persistent reminder that AI output must be checked against the original. */
export function VerifyBanner() {
  return (
    <p role="note" className="amcn-banner">
      <strong>Check with the clinic.</strong> This explanation is automatic and
      can contain mistakes. Compare it with your original document, and ask the
      clinic or insurer if you are unsure. It is not medical advice.
    </p>
  );
}

/** Confidence shown as words, never color alone. */
export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return (
      <p className="amcn-confidence">
        Reading quality: no text found. Try a clearer photo.
      </p>
    );
  }
  const rounded = Math.round(confidence);
  const label =
    rounded >= 85
      ? "good"
      : rounded >= 70
        ? "fair"
        : "low, check the text carefully";
  return (
    <p className="amcn-confidence">
      Reading quality: {label} ({rounded}%)
    </p>
  );
}
