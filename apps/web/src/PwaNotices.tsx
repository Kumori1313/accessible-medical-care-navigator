import { Button } from "@amcn/ui";
import type { PwaState } from "./pwa";

/** Offline and update notices. Rendered inside <main> so they are read in page order. */
export function PwaNotices({
  online,
  updateReady,
  offlineReady,
  applyUpdate,
}: PwaState) {
  return (
    <>
      {!online && (
        <p role="note" className="amcn-banner">
          <strong>You are offline.</strong> Your settings still work. Reading a
          new document and getting an explanation need an internet connection.
        </p>
      )}
      {updateReady && (
        <p role="note" className="amcn-banner">
          A new version is ready. Update when you are not in the middle of
          something; the page will reload.{" "}
          <Button onPress={applyUpdate}>Update now</Button>
        </p>
      )}
      {/* Polite live region stays mounted so the message is announced when it appears. */}
      <div role="status" aria-live="polite" className="amcn-status">
        {offlineReady ? "The app is ready to open without a connection." : null}
      </div>
    </>
  );
}
