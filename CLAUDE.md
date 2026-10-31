# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

`accessible-care-roadmap.md` is a phased plan (Phase 0–7) for an accessibility tool that helps disabled users navigate medical care (explaining forms, booking, provider communication). Phase 0 research/legal work is done; technical setup is in progress. Remote: `Kumori1313/accessible-medical-care-navigator` (branch `main`).

Set up so far: pnpm/Turborepo workspace with `apps/web` (React + Vite), `packages/ui` (React Aria Components + CSS tokens), `packages/core` (framework-free logic, e.g. access preferences), CI (`.github/workflows/ci.yml`), and the Python API in `services/api`. `apps/desktop` (Tauri 2) and `apps/mobile` (Capacitor 8, Android only) wrap the web app; see `docs/native-builds.md`.

## Web flow (`apps/web`)

`App.tsx` is a three-step flow (choose → review/edit text → explanation beside the original) that calls the API through `createApi` in `@amcn/core` (`packages/core/src/api.ts`, injectable for tests). The dev server proxies `/api` to `localhost:8000`. Accessibility conventions to keep: focus moves to the new step's heading on step changes (not on first render, so the skip link stays the first tab stop); progress goes through a persistent `StatusMessage` live region and errors through `role="alert"`; OCR confidence is shown in words, never color alone. Playwright specs in `apps/web/e2e` mock `/api/*` and run axe over each step in light and dark.

Read-aloud uses the browser's `speechSynthesis`: pure logic (chunking, `explanationToSpeech`, the `createReader` state machine) lives in `packages/core/src/speech.ts` and takes an injectable synth; `apps/web/src/ReadAloud.tsx` is the control. It never auto-plays, and the spoken text always begins with the "check with the clinic" disclaimer.

Preferences: `AccessPreferences` and everything around it live in `packages/core/src/preferences.ts`. `normalizePreferences` validates anything (e.g. parsed storage) into a complete object; `preferencesFromNeeds` maps the onboarding answers to presets; `applyPreferences` writes `data-*` attributes and `--amcn-font-scale` onto `<html>`, which `packages/ui/src/styles.css` keys off (theme, spacing, dyslexia font, reduced motion, one-handed). They are stored in `localStorage` (key `amcn.preferences.v1`) via an injectable store that tolerates blocked storage; no saved key means first run, which shows onboarding. Don't add new settings without extending `normalizePreferences`, `applyPreferences` and the Settings view together. Layout must keep reflowing at 320px wide with the largest text size (an e2e test checks it).

PWA (`apps/web/vite.config.ts`, `src/pwa.ts`, `src/PwaNotices.tsx`): `vite-plugin-pwa` with `registerType: "prompt"`, so a new version never reloads the page until the user presses "Update now". The service worker precaches the app shell only; `runtimeCaching` is deliberately empty and `/api/*` is excluded from the navigation fallback, because API responses contain the user's medical text and must never be cached. The worker is registered in production builds only (`import.meta.env.PROD`), so offline behaviour is tested by `e2e/pwa.spec.ts` against `vite preview`, and vitest aliases `virtual:pwa-register` to a stub. Icons in `apps/web/public` were generated (white cross on blue; the maskable one has extra padding for the safe zone).

Encrypted saved documents (`packages/core/src/vault/`, `apps/web/src/{useVault,idbStorage,SavedDocuments}.ts*`): opt-in, passphrase-based, all in WebCrypto with no crypto dependencies. A random data key (AES-GCM) encrypts documents; it is stored only wrapped twice, by a PBKDF2-derived passphrase key (600k iterations, stored in the record so it can be raised later) and by a recovery-key-derived key (shown once at setup, never stored). So changing/resetting the passphrase never re-encrypts documents. Each document's ciphertext is bound to its id via AES-GCM additional data. Only `id` and `createdAt` are readable at rest; title, text and explanation are encrypted. The original image is deliberately not stored (minimal retention). The key lives in memory only and is dropped on lock or after `autoLockMinutes` of inactivity (a preference). `VaultStorage` is an interface: IndexedDB in the app, in-memory in tests (pass `{ iterations: 1000 }` to `createVault` in tests; full cost is slow). Display preferences stay in plain localStorage on purpose. Passphrase loss is unrecoverable without the recovery key by design; "erase everything" works while locked. `e2e/vault.spec.ts` inspects raw IndexedDB bytes to prove no plaintext is stored; keep that test passing.

Native shells: they bundle the web app, so there is no `/api` proxy and no service worker. `apps/web` has `build:desktop` and `build:mobile`, which set `VITE_NATIVE=1` and write to separate folders (`dist-desktop`, `dist-mobile`) because each bakes in a different `VITE_API_BASE_URL`; never share one output folder between them. The API's CORS allow-list (`services/api/src/amcn_api/main.py`) must include each shell's origin, and Tauri's CSP `connect-src` in `tauri.conf.json` must include the API address. The shells' scripts are deliberately not named `build`, so `pnpm build` (Turborepo) stays fast; native builds run in `.github/workflows/native.yml`. ESLint ignores the native build output and generated projects.

Demo mode (`apps/web/src/demo/`): three built-in sample documents (real Tesseract output in `sampleText.ts`, pre-written explanations in `samples.ts`) that run with no server, key or network, so the offline fallback and the standalone desktop app have something to show. The explanations are NOT live model output and the UI labels them as such; `samples.test.ts` enforces that every quote is verbatim in the OCR text and every dollar figure is in the source. Editing a sample's text sends it to the real API instead. See `docs/conference-demo-plan.md` for the demo scope, build order and what not to claim.

Testing note: vitest runs without globals, so each package's `vitest.setup.ts` registers Testing Library `cleanup` explicitly; keep that when adding packages.

## API pipeline (`services/api/src/amcn_api`)

Deliberately split into steps so the client can show each result to the user before the next one runs: `POST /ocr` (Tesseract, returns text + confidence) → `POST /redact` (regex identifier removal; best-effort, names are not caught) → `POST /explain` (LLM, returns structured JSON). `/explain` only sees text the client submits. Model access goes through the `LLMProvider` protocol in `providers.py` (Anthropic via `AMCN_ANTHROPIC_API_KEY`, optional `AMCN_MODEL`); tests inject a fake via FastAPI `dependency_overrides[get_provider]`. `explain.py` treats document text as untrusted, validates the model's JSON, and drops any `quote` that isn't verbatim in the source. OCR needs the `tesseract` binary installed on the system.

Accuracy evaluation (`services/api/src/amcn_api/evalharness/`, docs in `docs/accuracy-evaluation.md`): `python -m amcn_api.evalharness {run,degrade,scaffold}` scores OCR and `/explain` output against hand-written TOML answer keys in `eval/answers/` using forms in `eval/forms/` (`eval/forms/MANIFEST.md` records sources; two state-government forms are git-ignored). It calls the same `run_ocr` and `explain_document` as the API, so a pipeline change is measured by re-running it. Scoring functions in `metrics.py` are pure and unit-tested; keep them that way. Never mark an answer key `reviewed = true` without checking it against the form, and never widen keywords just to raise a score.

## Commands

Python API (`services/api`, uv-managed, Python >=3.12):
- `uv sync` — install deps
- `uv run uvicorn amcn_api.main:app --reload` — dev server
- `uv run ruff check .` / `uv run mypy` / `uv run pytest` — lint / strict type-check / tests
- `uv run pytest tests/test_health.py::test_health` — single test
- From the repo root: `uv run --project services/api python -m amcn_api.evalharness run --ocr-only` — score OCR on the sample forms (no API key needed)

JS workspace (root, pnpm 12, Node >=22): `pnpm lint|typecheck|test|build` run via Turborepo across packages; `pnpm test:a11y` runs the axe-core Playwright check in `apps/web` (needs `pnpm --filter @amcn/web exec playwright install chromium` once).
- Single JS test: `pnpm --filter @amcn/core exec vitest run src/preferences.test.ts` (or `-t "name"`).
- Dependency pins: ESLint is kept on v9 (jsx-a11y doesn't support 10) and TypeScript on 6.0 (typescript-eslint doesn't support 7). Check `pnpm peers check` before bumping.
- ESLint runs `jsx-a11y` strict rules repo-wide; UI components wrap React Aria rather than raw elements where possible.

Consult `accessible-care-roadmap.md` for scope and phase exit criteria before adding features. Its rule: finish Phase 1 (photo of form → OCR → plain-language explanation → TTS) before starting later phases.

## Planned architecture (from the roadmap)

- **Stack:** TypeScript web-first PWA (React or Svelte), wrapped with Capacitor (iOS/Android) and Tauri (desktop). Python FastAPI backend for OCR/AI/speech.
- **Planned monorepo layout (pnpm/Turborepo):** `apps/web`, `apps/desktop` (Tauri), `apps/mobile` (Capacitor), `packages/ui`, `packages/core`, `services/api` (Python).
- **AI/OCR:** a provider abstraction layer so models (local or API, e.g. Ollama/llama.cpp, bring-your-own-key) are swappable. OCR is local first (Tesseract/PaddleOCR) with an optional vision-LLM fallback. Speech uses Whisper/whisper.cpp locally, with platform APIs as fallback.
- **Data:** local-first, encrypted storage; optional redaction of names/IDs before any remote API call.
- **CI (planned):** lint, type-check, unit tests, and axe-core accessibility checks on every PR. The assistive-tech test matrix is NVDA, JAWS, VoiceOver, TalkBack, Voice Control, Switch Control, and keyboard-only.

## Non-negotiable product principles

These constrain design and code decisions:

1. Accessibility is the product. Every screen must work with screen readers, keyboard-only, voice control, and switch devices. Target WCAG 2.2 AA minimum.
2. Human-in-the-loop: the AI proposes and the user confirms. Never book, submit, or send anything without explicit approval.
3. Always show the original document or text beside the AI's interpretation, with confidence indicators and a "verify with the clinic" prompt.
4. Scope is navigation, explanation, and communication, not medical advice.
5. Treat web pages and documents as untrusted input (prompt injection). Guard against the model inventing form fields or buttons.
6. Never store passwords in plaintext; prefer OS keychains.
