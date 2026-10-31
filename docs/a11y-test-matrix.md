# Accessibility Test Matrix

Automated checks (eslint `jsx-a11y`, axe-core in Vitest and Playwright) catch roughly a third of real accessibility problems. They cannot tell you whether a screen reader announces something sensibly or whether a flow is usable by voice or switch. This matrix covers the manual passes required by the roadmap.

## When to run

| Trigger | Scope |
|---|---|
| Before any phase exit | Full matrix, all core flows |
| Every release | Smoke pass (below) on at least one screen reader per platform |
| New or changed interactive component | That component, with keyboard plus one screen reader |
| Wrapper changes (Capacitor/Tauri upgrades) | Full pass on the affected platform |

## Environments

| # | Platform | Assistive tech | Browser / shell | Notes |
|---|---|---|---|---|
| 1 | Windows | NVDA (latest) | Firefox, Chrome | Primary free Windows reader |
| 2 | Windows | JAWS (current) | Chrome, Edge | Behaves differently from NVDA, so test both |
| 3 | Windows | Windows Voice Access | Chrome | Voice control |
| 4 | macOS | VoiceOver | Safari | Also covers the Tauri build on macOS |
| 5 | macOS | Voice Control | Safari | Say "show numbers" and "show names" |
| 6 | iOS | VoiceOver | Safari, Capacitor app | Test rotor, swipe, and touch exploration |
| 7 | iOS | Voice Control, Switch Control | Capacitor app | |
| 8 | Android | TalkBack | Chrome, Capacitor app | |
| 9 | Android | Voice Access, Switch Access | Capacitor app | |
| 10 | Linux | Orca | Firefox | Tauri/desktop on Linux |
| 11 | Any | Keyboard only (no mouse) | All browsers | Tab, Shift+Tab, Enter, Space, Esc, arrows |
| 12 | Any | 200% zoom and 400% reflow, large OS text | All | WCAG 1.4.4 and 1.4.10 |
| 13 | Any | Forced colors / high contrast, dark mode, reduced motion | All | `prefers-*` media queries |

Record the exact versions tested in each report. Screen reader and browser pairings matter, so do not assume one pairing's result transfers to another.

## Core flows

Each phase adds flows. A flow passes only if it can be completed start to finish in that environment without sighted or mouse assistance.

| Flow | Introduced |
|---|---|
| Onboarding and access-needs preferences | Phase 1 |
| Capture or upload a document | Phase 1 |
| Read the explanation beside the original | Phase 1 |
| Listen to text-to-speech output | Phase 1 |
| Change font size, contrast, motion, spacing | Phase 1 |
| Voice-only navigation of all of the above | Phase 2 |
| Screenshot walkthrough, save and resume | Phase 3 |
| Confirm or cancel an action (review screen) | Phase 3, 6 |

## Checklist (per flow, per environment)

**Structure and navigation**
- [ ] Page has a meaningful `<title>`, one `<h1>`, and a logical heading outline
- [ ] Landmarks present (`banner`, `main`, `navigation`) and reachable via the reader's landmark list
- [ ] Skip link is the first tab stop and moves focus to main content
- [ ] Tab order matches visual and reading order; no keyboard traps
- [ ] Focus is always visible, with at least 3:1 contrast against its background

**Names, roles, states**
- [ ] Every control announces a clear name, role, and state (pressed, expanded, selected, disabled)
- [ ] Form fields have programmatic labels; required fields and errors are announced
- [ ] Images of documents have useful alternatives; decorative images are hidden
- [ ] Icon-only buttons have accessible names

**Dynamic content**
- [ ] Loading, progress, success, and error changes are announced (live regions) without stealing focus
- [ ] After navigation or dialog open/close, focus moves somewhere sensible; closing a dialog returns focus to its trigger
- [ ] OCR/AI results announce confidence and the "verify with the clinic" prompt
- [ ] Nothing is booked, submitted, or sent without an explicit, announced confirmation step

**Input**
- [ ] Every action works by keyboard, by voice command (visible labels match accessible names), and by switch scanning
- [ ] Touch targets are at least 44x44 CSS px (24x24 absolute minimum per WCAG 2.2 AA)
- [ ] No gesture-only or drag-only actions; no timeouts that cannot be extended

**Presentation**
- [ ] Usable at 200% zoom and 400% reflow with no horizontal scroll or clipped content
- [ ] Text contrast at least 4.5:1 (3:1 for large text and UI components); information is never conveyed by color alone
- [ ] Respects `prefers-reduced-motion`, forced colors, and dark mode
- [ ] Dyslexia-friendly font and spacing options apply everywhere

## Smoke pass (every release, ~30 minutes)

1. Keyboard only: complete the main flow in Chrome.
2. NVDA + Firefox (or VoiceOver + Safari on macOS): complete the main flow and confirm announcements.
3. iOS VoiceOver or Android TalkBack on the Capacitor build: capture a document and hear the explanation.
4. 200% zoom plus high-contrast theme: confirm nothing is lost.

## Reporting issues

Log each failure with: environment (OS, AT, browser, versions), flow, steps, what was announced or happened, what was expected, and the WCAG criterion if known. Label GitHub issues `a11y` and set severity:

- **Blocker:** a user with that assistive tech cannot complete the flow.
- **Major:** completable only with significant workaround or confusion.
- **Minor:** annoying but does not impede completion.

Blockers stop a release. Where possible, add an automated regression test for the underlying cause.

## Who tests

Maintainers run the smoke pass. Full passes should include disabled testers who use these tools daily (see Phase 1 usability sessions); they find issues scripted checks miss, and should be compensated. Record results in a per-release file under `docs/a11y-reports/`.
