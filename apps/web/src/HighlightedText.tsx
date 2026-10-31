/** Original text with one excerpt marked, so each explained section can be found in the source. */
export function HighlightedText({
  text,
  quote,
}: {
  text: string;
  quote: string;
}) {
  const at = quote ? text.indexOf(quote) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{quote}</mark>
      {text.slice(at + quote.length)}
    </>
  );
}
