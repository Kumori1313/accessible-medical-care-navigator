**Care Navigator @VERSION@ for Windows: early preview.** Understand medical forms, bills and letters in plain
language, with accessibility settings built in. This is not medical advice; always check with your clinic or insurer.

## Install
1. Download **@FILE@** below.
2. Open it. Windows will probably say **"Windows protected your PC"** because this installer is not code-signed yet.
   Choose **More info**, then **Run anyway**. It installs for your account only and does not ask for an administrator.
3. The first launch may download Microsoft's WebView2 component (already present on most Windows 10 and 11 PCs).
4. To remove it: Settings > Apps > Installed apps > Care Navigator > Uninstall.

Windows 10 or 11, 64-bit.

## What works with no setup
- **Three sample documents** (an insurance statement, a Medicare permission form, a flu vaccine handout) with plain-language
  explanations that work offline. The explanations are pre-written, and the app says so.
- **Read aloud**, **ask a question** by typing (voice input depends on your system and may not be available), the
  text-and-original side-by-side view, and every accessibility setting: text size, high contrast, dyslexia-friendly font, line spacing,
  reduced motion, one-handed layout.
- Optional encrypted saving of documents on your own computer, protected by a passphrase only you know.

## What needs more
Reading **your own** photos and getting a live explanation needs the Care Navigator server and an AI key, which this
installer does not include yet. Without them, those buttons show a "could not reach the service" message. Use the samples.

## Privacy
Nothing is sent anywhere in sample mode. If voice input is available and you use it, your voice may be processed by an online speech service. Do not put real patient documents into a preview build.

## Verify your download (optional)
SHA-256 of **@FILE@**:
`@SHA256@`
In PowerShell: `Get-FileHash .\@FILE@ -Algorithm SHA256`

Source code and issues: https://github.com/Kumori1313/accessible-medical-care-navigator
