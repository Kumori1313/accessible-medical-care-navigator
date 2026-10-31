# Development Roadmap: Accessible Medical Care Navigator

A phased plan for building a cross-platform accessibility tool that helps disabled users navigate the medical care system: understanding forms, booking appointments, communicating with providers, and getting personalized assistance.

**Core stack decision:** TypeScript, web-first PWA (React or Svelte), wrapped with **Capacitor** (iOS/Android) and **Tauri** (desktop). Python backend (FastAPI) for AI/OCR/speech services. One codebase, plus a website for free.

> Timelines below assume a small team (1-3 developers) and are rough. Treat them as relative sizing, not commitments.

---

## Guiding Principles (apply to every phase)

1. **Accessibility is the product, not a feature.** Every screen must work with screen readers, keyboard-only, voice control, and switch devices before it ships.
2. **Human-in-the-loop for actions.** The AI proposes; the user confirms. Never book, submit, or send anything without explicit approval.
3. **Show the original beside the AI's interpretation.** OCR and LLMs make mistakes on medical and insurance paperwork.
4. **Navigation, not medical advice.** Keep scope to logistics, explanation, and communication.
5. **Local-first and privacy-minimizing.** Process on-device when feasible, encrypt everything stored, retain as little as possible.
6. **Co-design with disabled users** from the first prototype onward, and compensate participants.

---

## Phase 0: Foundations and Discovery (Weeks 1-4)

**Goal:** Validate the problem, define scope, and set up the groundwork so later phases don't need rework.

### Research
- [ ] Recruit 8-12 disabled users across disability types (blind/low vision, Deaf/hard of hearing, mobility/dexterity, cognitive/neurodivergent, chronic illness/fatigue) for interviews
- [ ] Map the real journey: finding a provider, booking, paperwork, arriving, the visit, follow-up, billing
- [ ] Identify the top 5 pain points per group; rank by severity and frequency
- [ ] Review existing tools (patient portals, relay services, screen reader add-ons) to find gaps

### Legal, privacy, and compliance
- [ ] Consult a lawyer on HIPAA applicability (depends on how you handle data and whether you act as a business associate)
- [ ] Draft a data-handling policy: what's stored, where, for how long, who can access
- [ ] Decide the data model: local-only by default vs. optional encrypted sync
- [ ] Plan consent flows for AI processing and any third-party API use
- [ ] Review state and federal rules on recording conversations (relevant to live captioning/notes)

### Technical setup
- [ ] Monorepo (pnpm/Turborepo): `apps/web`, `apps/desktop` (Tauri), `apps/mobile` (Capacitor), `packages/ui`, `packages/core`, `services/api` (Python)
- [ ] Design system with accessibility baked in (focus management, ARIA patterns, color tokens that meet WCAG 2.2 AA/AAA contrast, scalable type)
- [ ] CI pipeline: lint, type-check, unit tests, **axe-core** automated accessibility checks on every PR
- [ ] Set up an accessibility test matrix: NVDA, JAWS, VoiceOver (macOS/iOS), TalkBack, Voice Control, Switch Control, keyboard-only
- [ ] Decide on AI provider strategy: bring-your-own-key, optional hosted, optional local (Ollama/llama.cpp)

**Exit criteria:** Documented user journeys, prioritized problem list, compliance plan, working repo with CI and an accessible component library skeleton.

---

## Phase 1: MVP Core, "Understand My Paperwork" (Weeks 5-12)

**Goal:** Ship the smallest useful feature end to end: photo of a form to plain-language explanation to read aloud. This forces you to get accessibility, privacy, and accuracy right early.

### Features
- [ ] **Document capture and upload** (camera, file picker, drag and drop), with guidance for good photos (edge detection, lighting hints, spoken/haptic feedback for blind users)
- [ ] **OCR pipeline**: Tesseract or PaddleOCR locally, with an optional vision-LLM fallback for poor scans
- [ ] **Plain-language explanation**: LLM summarizes what the form is, what each section asks, and what's required vs. optional
- [ ] **Side-by-side view**: original image/text next to the explanation, with highlighted correspondences
- [ ] **Confidence indicators** and a persistent "verify with the clinic" prompt
- [ ] **Text-to-speech output** (system TTS first; optional higher-quality local TTS later)
- [ ] **Plain-language mode** with adjustable reading level
- [ ] **Customizable UI settings**: font size, contrast themes, dyslexia-friendly font, reduced motion, spacing, one-handed layout
- [ ] **Encrypted local storage** for saved documents and settings
- [ ] **Onboarding** that asks about access needs and pre-configures settings

### Technical tasks
- [ ] FastAPI service with endpoints for OCR and explanation
- [ ] Provider abstraction layer so models (local or API) are swappable
- [ ] Redaction option: strip names/IDs before sending to any remote API
- [ ] PWA setup: offline shell, installable, service worker caching
- [ ] Capacitor and Tauri builds producing working installs

### Testing
- [ ] Usability sessions with at least 2 users per disability group
- [ ] Accuracy evaluation: test set of 50+ real-world forms (consent forms, intake forms, insurance forms, EOBs) with documented error rates
- [ ] Full assistive tech pass on all flows

**Exit criteria:** A user can photograph a form and get a correct, readable, audible explanation; accessibility audit passes; measured accuracy documented.

---

## Phase 2: Voice-First Interaction (Weeks 13-18)

**Goal:** Make the entire app usable by voice, for users with visual or physical impairments.

### Features
- [ ] **Speech-to-text prompting** (Whisper/whisper.cpp locally; platform APIs as fallback)
- [ ] **Voice-first navigation**: every screen and action reachable by spoken commands
- [ ] **Conversational assistant** for questions like "What does this form want from me?"
- [ ] **Spoken confirmations** for every action, with an easy "undo/cancel" phrase
- [ ] **Noise and speech-difference handling**: support for dysarthria, accents, stuttering (adjustable timeouts, correction UI, custom vocabulary)
- [ ] **Hands-free mode** with wake word or single large switch-accessible trigger
- [ ] **Audio, visual, and haptic feedback options** for all status changes

### Technical tasks
- [ ] Streaming audio pipeline (VAD, chunking, partial transcripts)
- [ ] On-device vs. server transcription decision per platform (desktop local, mobile hybrid)
- [ ] Intent layer mapping utterances to app actions
- [ ] Compatibility testing with OS-level voice control (avoid conflicting gestures/commands)

**Exit criteria:** A blind or mobility-impaired tester can complete the Phase 1 flow entirely hands-free and screen-free.

---

## Phase 3: Guided Walkthroughs for Inaccessible Websites (Weeks 19-26)

**Goal:** Upload a screenshot (or share a page) of an inaccessible booking site or form and be walked through it step by step.

### Features
- [ ] **Screenshot upload and analysis** with a vision-capable model
- [ ] **Step-by-step walkthrough**: "The first field is your name. Tap the box near the top."
- [ ] **Progress tracking** with save/resume ("continue later")
- [ ] **Field-by-field help**: explain unclear fields, suggest what info to have ready
- [ ] **Pre-fill assistant**: stores user-approved profile data (name, insurance, allergies, accommodations) and shows what it would enter, requiring confirmation
- [ ] **Booking-to-arrival checklist**: confirmation saved, reminders set, what to bring, arrival instructions
- [ ] **Appointment prep tool**: generates a question checklist and a one-page summary of the user's concerns to hand to the provider
- [ ] **Energy and cognitive-load settings**: shorter steps, one decision per screen, optional pacing and break prompts

### Technical tasks
- [ ] Prompt and schema design for walkthrough generation (structured JSON steps)
- [ ] Optional browser extension or in-app browser for live guidance on a real page (evaluate feasibility and risk)
- [ ] Handling of multi-page flows and changes between screenshots
- [ ] Guardrails against the model inventing fields or buttons that don't exist

**Exit criteria:** Testers complete real bookings on at least 5 known-inaccessible sites using the walkthrough, with measurable reduction in time and frustration.

---

## Phase 4: Care Logistics and Information (Weeks 27-34)

**Goal:** Cover the surrounding tasks that decide whether a visit is actually possible.

### Features
- [ ] **Clinic accessibility information**: step-free entry, accessible parking, interpreter availability, sensory-friendly hours, accessible exam equipment (crowdsourced and provider-verified, with sources and "last verified" dates)
- [ ] **Accommodation request generator**: drafts requests for interpreters, accessible exam tables, extended appointment times, ADA accommodations, with editable templates
- [ ] **Transportation help**: paratransit and ride-booking support, accessible route and arrival directions
- [ ] **Medication and appointment reminders** with multiple channels (audio, vibration, visual, caregiver notification)
- [ ] **Billing and insurance explainer**: plain-language breakdown of EOBs, bills, and prior-authorization letters, with questions to ask the insurer
- [ ] **Post-visit recap**: plain-language summary of notes the user provides or dictates, with action items and follow-up reminders
- [ ] **Offline mode** for essentials: saved forms, scripts, appointment details, emergency information

### Technical tasks
- [ ] Data sources and moderation plan for clinic accessibility data
- [ ] Notification system across web, mobile, and desktop (with accessible alerts)
- [ ] Calendar integration (ICS, Google, Apple, Outlook)
- [ ] Sync strategy for offline data and conflict handling

**Exit criteria:** A user can go from "I need a specialist" to "I have a confirmed, accessible appointment with transport and reminders" using the app.

---

## Phase 5: Communication Support (Weeks 35-42)

**Goal:** Help users communicate with providers, staff, and insurers in the way that works for them.

### Features
- [ ] **Live captioning** for in-person conversations (microphone to captions, large-text display)
- [ ] **Typed-to-speech for calls and in-person use**, with quick-phrase boards that work alongside existing AAC tools
- [ ] **Call scripts and assisted calls**: prepare what to say; explore AI-assisted calling with clear disclosure and user consent (research legal and ethical requirements first)
- [ ] **Conversation notes**: optional recording and summarization with consent prompts for all parties
- [ ] **Translation and plain-language rewriting** of provider instructions
- [ ] **Interpreter coordination**: request, schedule, and prepare materials for sign language or spoken-language interpreters
- [ ] **Message drafting** for patient portals and email, at a reading level and tone the user chooses

### Technical tasks
- [ ] Low-latency streaming captioning with speaker handling
- [ ] Consent and recording-law logic (varies by jurisdiction)
- [ ] Integration points for AAC apps and relay services (research APIs and partnerships)

**Exit criteria:** Deaf, hard-of-hearing, and speech-impaired testers complete a realistic clinic interaction (check-in, visit, follow-up call) with the app, and report improved confidence.

---

## Phase 6: Agentic Assistance and Personalization (Weeks 43-52)

**Goal:** Carefully add agentic capabilities, the highest-value and highest-risk features, only after the foundations are proven.

### Features
- [ ] **Agentic booking assistant** with scoped permissions (which sites, which actions, which data), shown as an editable plan before execution
- [ ] **Action review screen**: exact summary of what will be submitted, with approve/edit/cancel
- [ ] **Full action log** that the user can review and revoke permissions from at any time
- [ ] **Personal profile and preferences**: communication style, access needs, accommodations, provider history, all user-controlled
- [ ] **Caregiver or trusted-person sharing** with granular, revocable permissions and visibility into what was shared
- [ ] **Personalized assistant**: adapts explanations, pacing, and interface to the user's stated needs over time
- [ ] **Local model option** for users who want everything on-device (desktop first)

### Technical tasks
- [ ] Sandboxed browser automation with strict permission scopes and kill switch
- [ ] Prompt-injection defenses (web pages and documents are untrusted input)
- [ ] Rate limiting, anomaly detection, and fail-safe defaults (when uncertain, ask)
- [ ] Red-team testing for harmful or incorrect actions
- [ ] Secure credential handling (never store passwords in plaintext; prefer OS keychains)

**Exit criteria:** Agentic booking succeeds reliably on a defined set of sites, with zero unconfirmed actions in testing and a clear audit trail.

---

## Phase 7: Hardening, Launch, and Growth (Weeks 53-60)

### Quality and safety
- [ ] Independent accessibility audit (WCAG 2.2 AA minimum; AAA where feasible) by an external firm or disabled auditors
- [ ] Security audit and penetration test
- [ ] Privacy review and updated policies; publish a plain-language privacy summary
- [ ] Accuracy re-evaluation with an expanded test set; publish known limitations
- [ ] Performance testing on older and low-end devices

### Launch
- [ ] Beta program with disabled users, a feedback channel that's itself accessible, and fast iteration
- [ ] App store submissions (accessibility metadata, descriptions, screenshots with alt text)
- [ ] Documentation: accessible help center, video with captions and audio description, plain-language guides
- [ ] Support process: accessible contact methods (phone, text, email, chat)
- [ ] Sustainability plan: funding, grants, nonprofit partnerships, or pricing model that doesn't exclude low-income users

### Ongoing
- [ ] Regular accessibility regression testing on every release
- [ ] Community advisory board of disabled users with real influence on the roadmap
- [ ] Monitor model and OS changes that affect accessibility behavior

---

## Feature Coverage Checklist

| Feature | Phase |
|---|---|
| Form photo to plain-language explanation | 1 |
| OCR (local) + LLM pipeline | 1 |
| Text-to-speech and read aloud | 1 |
| Plain-language mode | 1 |
| Customizable UI (font, contrast, dyslexia font, motion) | 1 |
| Speech-to-text and voice-first navigation | 2 |
| Screenshot-based website walkthroughs | 3 |
| Appointment prep and booking-to-arrival checklist | 3 |
| Energy and cognitive-load settings | 3 |
| Clinic accessibility information | 4 |
| Accommodation request generator | 4 |
| Transportation help | 4 |
| Medication and appointment reminders | 4 |
| Billing/insurance (EOB) explainer | 4 |
| Post-visit recap | 4 |
| Offline mode | 1 (shell) / 4 (full) |
| Live captioning | 5 |
| Typed-to-speech and AAC-compatible phrase boards | 5 |
| Call support and interpreter coordination | 5 |
| Agentic booking (with confirmation) | 6 |
| Caregiver/trusted-person sharing | 6 |
| Personalized assistant | 6 |
| Local-model option | 1 (OCR) / 6 (full LLM) |

---

## Key Risks and Mitigations

| Risk | Mitigation |
|---|---|
| AI misreads or misexplains medical/insurance forms | Side-by-side view, confidence indicators, "verify with clinic" prompts, published accuracy metrics |
| Privacy breach of health information | Local-first processing, encryption, redaction before remote calls, minimal retention, legal review |
| Agentic actions cause unintended consequences | Scoped permissions, mandatory confirmation, action logs, kill switch, staged rollout |
| Prompt injection from websites or documents | Treat all external content as untrusted, sandboxing, no autonomous high-impact actions |
| Wrapper frameworks introduce accessibility gaps | Test on real devices and assistive tech every release; use native components where web falls short |
| Mobile devices can't run capable local models | Hybrid design: local OCR/speech, optional API or self-hosted models for LLM tasks |
| Scope creep | Hold phase exit criteria; ship Phase 1 before starting anything else |
| Burnout or loss of funding | Early grant and partnership exploration; keep the MVP small and useful |

---

## Suggested First 30 Days

1. Run 8-12 user interviews and publish a journey map.
2. Consult a lawyer about HIPAA and data handling.
3. Stand up the monorepo, CI with axe-core, and a minimal accessible component library.
4. Prototype photo to OCR to explanation to TTS in a single throwaway flow.
5. Test the prototype with 3-5 users using real assistive technology, and let their feedback reshape Phase 1.

---

*This roadmap is a living document. Revisit it after each phase with findings from user testing, and let the people using the tool decide what comes next.*
