import { MIN_PASSPHRASE_LENGTH } from "@amcn/core";
import { Button, ErrorMessage, StatusMessage } from "@amcn/ui";
import { useEffect, useId, useRef, useState } from "react";
import { ConfirmButton } from "./ConfirmButton";
import type { VaultApi } from "./useVault";

function PassphraseField({
  label,
  value,
  onChange,
  hint,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  autoComplete: "new-password" | "current-password";
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <p>
      <label htmlFor={id}>{label}</label>
      {hint && <small id={`${id}-hint`}> {hint}</small>}
      <input
        id={id}
        className="amcn-field"
        type={shown ? "text" : "password"}
        value={value}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={shown}
          onChange={(e) => setShown(e.target.checked)}
        />{" "}
        Show what I type
      </label>
    </p>
  );
}

function SetupForm({
  vault,
  onCreated,
}: {
  vault: VaultApi;
  onCreated: (recoveryKey: string) => void;
}) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [mismatch, setMismatch] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (pass !== again) return setMismatch(true);
        setMismatch(false);
        const key = await vault.create(pass);
        if (key) onCreated(key);
      }}
    >
      <p>
        Saving is optional and off until you set it up. Saved documents are
        encrypted on this device with a passphrase only you know. Nothing is
        sent anywhere, and we cannot read them or reset your passphrase for you.
      </p>
      <PassphraseField
        label="Choose a passphrase"
        hint={`At least ${MIN_PASSPHRASE_LENGTH} characters. A few random words in a row works well.`}
        value={pass}
        onChange={setPass}
        autoComplete="new-password"
      />
      <PassphraseField
        label="Type it again"
        value={again}
        onChange={setAgain}
        autoComplete="new-password"
      />
      {mismatch && (
        <ErrorMessage>The two passphrases don't match.</ErrorMessage>
      )}
      <div className="amcn-actions">
        <Button type="submit" isDisabled={vault.busy || !pass}>
          {vault.busy ? "Setting up…" : "Set up saving"}
        </Button>
      </div>
    </form>
  );
}

/** Shown once, right after setup. The key is never stored, so this is the only chance to keep it. */
function RecoveryKeyStep({
  recoveryKey,
  onDone,
}: {
  recoveryKey: string;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section aria-labelledby="h-recovery">
      <h2 id="h-recovery" ref={heading} tabIndex={-1}>
        Keep your recovery key
      </h2>
      <p>
        If you forget your passphrase, this key is the only way back in. Save it
        somewhere safe, such as a password manager, or write it down. It will
        not be shown again.
      </p>
      <p>
        <label htmlFor="recovery-key">Recovery key</label>
        <input
          id="recovery-key"
          className="amcn-field amcn-recovery"
          readOnly
          value={recoveryKey}
          spellCheck={false}
          autoComplete="off"
          onFocus={(e) => e.currentTarget.select()}
        />
      </p>
      <Button
        onPress={async () => {
          try {
            await navigator.clipboard.writeText(recoveryKey);
            setCopied("Recovery key copied.");
          } catch {
            setCopied(
              "Could not copy. Please copy it by hand or write it down.",
            );
          }
        }}
      >
        Copy recovery key
      </Button>
      <StatusMessage>{copied}</StatusMessage>
      <p>
        <label>
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />{" "}
          I have saved my recovery key somewhere safe
        </label>
      </p>
      <div className="amcn-actions">
        <Button onPress={onDone} isDisabled={!saved}>
          Continue
        </Button>
      </div>
    </section>
  );
}

function UnlockForm({ vault }: { vault: VaultApi }) {
  const [pass, setPass] = useState("");
  const [forgot, setForgot] = useState(false);
  const [key, setKey] = useState("");
  const [fresh, setFresh] = useState("");

  if (forgot) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await vault.recover(key, fresh);
        }}
      >
        <p>
          Enter your recovery key, then choose a new passphrase. Your saved
          documents will still be there.
        </p>
        <p>
          <label htmlFor="rk">Recovery key</label>
          <input
            id="rk"
            className="amcn-field"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </p>
        <PassphraseField
          label="New passphrase"
          value={fresh}
          onChange={setFresh}
          autoComplete="new-password"
        />
        <div className="amcn-actions">
          <Button type="submit" isDisabled={vault.busy || !key || !fresh}>
            Unlock with recovery key
          </Button>
          <Button onPress={() => setForgot(false)}>Back</Button>
        </div>
      </form>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await vault.unlock(pass)) setPass("");
      }}
    >
      <PassphraseField
        label="Passphrase"
        value={pass}
        onChange={setPass}
        autoComplete="current-password"
      />
      <div className="amcn-actions">
        <Button type="submit" isDisabled={vault.busy || !pass}>
          {vault.busy ? "Unlocking…" : "Unlock"}
        </Button>
        <Button onPress={() => setForgot(true)}>I forgot my passphrase</Button>
      </div>
    </form>
  );
}

export function SavedDocuments({
  vault,
  pendingTitle,
  notice,
  onOpen,
  onBack,
}: {
  vault: VaultApi;
  /** Title of a document waiting to be saved once the vault is unlocked. */
  pendingTitle?: string;
  notice: string;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <section aria-labelledby="h-saved">
      <h1 id="h-saved" ref={heading} tabIndex={-1}>
        Saved documents
      </h1>
      <StatusMessage>{notice}</StatusMessage>
      {vault.error && <ErrorMessage>{vault.error}</ErrorMessage>}
      {vault.autoLocked && vault.status === "locked" && (
        <p role="note">
          Saved documents locked after a while without activity. Your current
          work is still on screen.
        </p>
      )}
      {pendingTitle && vault.status !== "unlocked" && (
        <p role="note">
          To save “{pendingTitle}”,{" "}
          {vault.status === "none" ? "set up saving" : "unlock"} first. It will
          be saved automatically.
        </p>
      )}

      {vault.status === "loading" && <p>Checking saved documents…</p>}
      {vault.status === "unavailable" && (
        <p>
          Saving is not available in this browser, so documents cannot be stored
          on this device.
        </p>
      )}
      {vault.status === "none" && (
        <SetupForm vault={vault} onCreated={setRecoveryKey} />
      )}
      {vault.status === "locked" && <UnlockForm vault={vault} />}

      {vault.status === "unlocked" && recoveryKey && (
        <RecoveryKeyStep
          recoveryKey={recoveryKey}
          onDone={() => setRecoveryKey(null)}
        />
      )}
      {vault.status === "unlocked" && !recoveryKey && (
        <>
          {vault.docs.length === 0 ? (
            <p>
              Nothing saved yet. After you get an explanation, choose “Save this
              document”.
            </p>
          ) : (
            <ul>
              {vault.docs.map((d) => (
                <li key={d.id}>
                  <strong>{d.title}</strong>{" "}
                  <small>
                    {new Date(d.createdAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </small>
                  <div>
                    <Button
                      onPress={() => onOpen(d.id)}
                      isDisabled={vault.busy}
                    >
                      Open
                    </Button>{" "}
                    <ConfirmButton
                      label="Delete"
                      question={`Delete “${d.title}”?`}
                      confirmLabel="Yes, delete"
                      onConfirm={() => void vault.remove(d.id)}
                      isDisabled={vault.busy}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="amcn-actions">
            <Button onPress={vault.lock}>Lock now</Button>
          </div>
        </>
      )}

      {(vault.status === "locked" ||
        (vault.status === "unlocked" && !recoveryKey)) && (
        <p>
          <ConfirmButton
            label="Erase all saved documents"
            question="Erase every saved document and your passphrase? This cannot be undone."
            confirmLabel="Yes, erase everything"
            onConfirm={() => void vault.erase()}
            isDisabled={vault.busy}
          />
        </p>
      )}

      <div className="amcn-actions">
        <Button onPress={onBack}>Back</Button>
      </div>
    </section>
  );
}
