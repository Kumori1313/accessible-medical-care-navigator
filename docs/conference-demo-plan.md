# Conference demo plan

Goal: a convincing, reliable demo in under a week. Driven live from one laptop, plus a desktop app attendees can
try themselves. Both a voice feature and a screenshot walkthrough were requested; the order below says what to
cut first if time runs out.

## What the demo shows (roadmap areas)

| Area | Status |
|---|---|
| Phase 1: photo → plain-language explanation → read aloud, side by side with the original | Built. Make it flawless |
| Phase 1: accessibility settings (high contrast, dyslexia font, one-handed, text size) | Built. Show it live; it is the differentiator |
| Phase 2 slice: ask a question about a document by voice | To build |
| Phase 3 slice: screenshot of an inaccessible booking page → step-by-step guidance | To build, last |
| Phases 4-7 (clinic data, transport, agentic booking, caregivers) | Out of scope. Do not build or claim |

## Build order (cut from the bottom)

1. **Demo mode** with built-in sample documents that work with no server, key or network. (Done: three public
   US government documents with real OCR output and pre-written explanations, labelled as such in the UI.)
2. Image cleanup before OCR (deskew, contrast), measured with the evaluation harness. Phone photos under booth
   lighting are the biggest live risk: OCR found only 43% of key phrases on phone-style photos.
3. Voice questions about a document.
4. Desktop release builds (Linux, Windows, macOS), unsigned, published as a draft release.
5. Screenshot walkthrough. If time is short, ship it with a canned sample only.

## Two kinds of users

- **You, on your laptop:** run the API with your `AMCN_ANTHROPIC_API_KEY` for live explanations on real photos.
- **Attendees, on the desktop app:** no server and no key, so they get demo mode (samples, read aloud, all the
  accessibility settings, saving). Live explanation of their own documents needs a server and a key. Say this
  plainly rather than letting them find out.

## Corners cut on purpose

No accounts, no hosting or public endpoint (so no abuse or spend risk), no iOS, no code signing (attendees will
see an "unidentified developer" or SmartScreen warning; the release notes must say how to open it), no
translations, no 50-form accuracy study, no agentic booking.

## What not to claim

- No accuracy number. There is no real error rate yet; say "preliminary".
- Not HIPAA compliant, not medical advice. Use only the sample or synthetic documents on stage. Never a real
  patient document, including your own.
- Sample explanations are pre-written, not live model output. The UI says so; say so too.

## Demo script (about 5 minutes)

1. Open the app, pick **Insurance statement**. "Real public document, read by OCR. This is what the phone
   camera step does." Point out the confidence line and that the text is editable.
2. **Explain.** Show the side-by-side view and click "What you owe" to highlight where it came from.
3. **Read aloud.** Change speed. Mention the spoken disclaimer.
4. **Settings.** Turn on high contrast, largest text, dyslexia font, one-handed layout. "Set once during onboarding."
5. (If built) Ask a question by voice. (If built) Screenshot walkthrough.
6. Close on the human-in-the-loop principle: nothing is sent or booked without the user.

## Before the day

- Run the full flow once with the real key and a few of your own synthetic photos in the venue's lighting.
- Have a recorded backup video, and the samples ready as the offline fallback.
- Charge the laptop, disable notifications, check speech synthesis voices on that machine, and test audio.
