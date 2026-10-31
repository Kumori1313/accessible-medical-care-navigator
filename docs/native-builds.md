# Native builds (Tauri desktop, Capacitor Android)

The web app is the single codebase; `apps/desktop` (Tauri) and `apps/mobile` (Capacitor) wrap it. Native shells bundle the app, so they have **no `/api` proxy and no service worker**. Instead:

- The web app is built with `VITE_NATIVE=1` and `VITE_API_BASE_URL=<server address>` baked in (`build:desktop` and `build:mobile` in `apps/web`, each with its own output folder so the two addresses can't mix).
- The API allows the shells' origins through CORS (`tauri://localhost`, `https://localhost`, `capacitor://localhost`; see `services/api/src/amcn_api/main.py`). Other origins are refused unless set in `AMCN_CORS_ORIGINS`.

The app sends document text to whatever server the build points at. For a local-first setup, run the API on the same machine (desktop) or on a server you control (phone).

## Desktop (Tauri 2)

Needs Rust and the WebKitGTK libraries (Arch: `webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg`; Debian/Ubuntu: see `.github/workflows/native.yml`).

```
pnpm --filter @amcn/desktop dev       # window on the Vite dev server (uses the /api proxy)
pnpm --filter @amcn/desktop package   # installers (deb/rpm/AppImage on Linux)
pnpm --filter @amcn/desktop exec tauri build --no-bundle   # just the binary, faster
```

The release build points at `http://localhost:8000` (`beforeBuildCommand` in `tauri.conf.json`). To use another server, change it there **and** in `app.security.csp` (`connect-src`), which otherwise blocks the request.

## Android (Capacitor 8)

Needs JDK 21 and the Android SDK (`ANDROID_HOME`, or `sdk.dir` in `apps/mobile/android/local.properties`, which is git-ignored). Install what Capacitor targets: `sdkmanager "platforms;android-36" "build-tools;35.0.0"` (see `compileSdkVersion` in `android/variables.gradle`). Verified: `assembleDebug` builds a ~4.5 MB APK with these.

```
cd apps/mobile
VITE_API_BASE_URL=https://your-server.example pnpm android:debug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

For a development API over plain HTTP (e.g. an emulator reaching `http://10.0.2.2:8000`), also set `CAP_CLEARTEXT=1` when syncing. Never ship that.

`appId` / `identifier` is `io.github.kumori1313.amcn` in both shells. It becomes the Android application id and cannot change after publishing.

## Not done

- **iOS:** needs macOS and Xcode. When adding it, set `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` in `Info.plist` ("Take a photo" depends on them).
- **macOS/Windows desktop builds:** Tauri builds natively per OS; add CI runners for them before releasing.
- **Code signing, release keystores, store listings.**
- **Manual assistive-technology pass** on each shell (TalkBack in the Android build; Orca/NVDA/VoiceOver with the desktop build). WebView accessibility differs from the browser. See `docs/a11y-test-matrix.md`.
