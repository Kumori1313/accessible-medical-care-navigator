/** First focusable element on a page; lets keyboard/screen-reader users skip navigation. */
export function SkipLink({ targetId = "main" }: { targetId?: string }) {
  return (
    <a className="amcn-skip-link" href={`#${targetId}`}>
      Skip to main content
    </a>
  );
}
