# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

`accessible-care-roadmap.md` is a phased plan (Phase 0–7) for an accessibility tool that helps disabled users navigate medical care (explaining forms, booking, provider communication). Phase 0 research/legal work is done; technical setup is in progress. Remote: `Kumori1313/accessible-medical-care-navigator` (branch `main`).

Set up so far: pnpm/Turborepo workspace with `apps/web` (React + Vite), `packages/ui` (React Aria Components + CSS tokens), `packages/core` (framework-free logic, e.g. access preferences), CI (`.github/workflows/ci.yml`), and the Python API in `services/api`. `apps/desktop` (Tauri) and `apps/mobile` (Capacitor) are placeholder READMEs only.

## Web flow (`apps/web`)

`App.tsx` is a three-step flow (choose → review/edit text → explanation beside the original) that calls the API through `createApi` in `@amcn/core` (`packages/core/src/api.ts`, injectable for tests). The dev server proxies `/api` to `localhost:8000`. Accessibility conventions to keep: focus moves to the new step's heading on step changes (not on first render, so the skip link stays the first tab stop); progress goes through a persistent `StatusMessage` live region and errors through `role="alert"`; OCR confidence is shown in words, never color alone. Playwright specs in `apps/web/e2e` mock `/api/*` and run axe over each step in light and dark.

Read-aloud uses the browser's `speechSynthesis`: pure logic (chunking, `explanationToSpeech`, the `createReader` state machine) lives in `packages/core/src/speech.ts` and takes an injectable synth; `apps/web/src/ReadAloud.tsx` is the control. It never auto-plays, and the spoken text always begins with the "check with the clinic" disclaimer.

## API pipeline (`services/api/src/amcn_api`)

Deliberately split into steps so the client can show each result to the user before the next one runs: `POST /ocr` (Tesseract, returns text + confidence) → `POST /redact` (regex identifier removal; best-effort, names are not caught) → `POST /explain` (LLM, returns structured JSON). `/explain` only sees text the client submits. Model access goes through the `LLMProvider` protocol in `providers.py` (Anthropic via `AMCN_ANTHROPIC_API_KEY`, optional `AMCN_MODEL`); tests inject a fake via FastAPI `dependency_overrides[get_provider]`. `explain.py` treats document text as untrusted, validates the model's JSON, and drops any `quote` that isn't verbatim in the source. OCR needs the `tesseract` binary installed on the system.

## Commands

Python API (`services/api`, uv-managed, Python >=3.12):
- `uv sync` — install deps
- `uv run uvicorn amcn_api.main:app --reload` — dev server
- `uv run ruff check .` / `uv run mypy` / `uv run pytest` — lint / strict type-check / tests
- `uv run pytest tests/test_health.py::test_health` — single test

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
