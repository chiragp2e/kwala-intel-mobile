# Kwala Intel mobile

A minimal, chat-first React Native app for Kwala Intel: sign in with email or mobile OTP, ask market questions, read
streamed answers, revisit past chats. It talks to the **same backend as the web app** (Supabase auth, the Go API, and the
chat service); it has no backend of its own.

- React Native Community CLI, TypeScript (strict), Android + iOS. `ios/` and `android/` are normal native projects.
- **Versions:** React Native 0.83.10, React 19.2, Expo SDK 55 modules (`expo-updates`, `expo-secure-store`, `expo-crypto`, …).
  *Why not SDK 58 / RN 0.88 (newest):* SDK 56+ builds a Swift 6.2 package and needs **Xcode 26**; the Mac this was built on has
  Xcode 16.4. SDK 55 builds with Xcode 16.4. Upgrade to the newest SDK once Xcode 26 is installed (and Apple requires Xcode 26 for
  App Store uploads anyway). Upgrade steps: bump `expo` and run `npx expo install --fix`, re-run `install-expo-modules`, `pod install`.
- Dark theme only (the supplied designs are dark).

## Setup
```
nvm use 22            # Node >= 20
npm ci                # also writes src/config/env.generated.ts from .env* (see below)
cd ios && LANG=en_US.UTF-8 pod install && cd ..      # CocoaPods needs a UTF-8 locale
```

### Run in development
```
cp .env.example .env            # fill in values, or set USE_MOCK_BACKEND=true for a no-credentials demo
npm run env:dev                 # regenerate env after editing .env
npm start                       # Metro
npm run ios                     # or: npm run android   (Android needs a flavor: use Android Studio, or `cd android && ./gradlew installStagingDebug`)
```
`USE_MOCK_BACKEND=true` works **only** when `APP_ENV=development`. It signs you in as a fake user and replies with canned text
so the UI can be shown. Staging and production builds ignore it.

## API and environment configuration
Values live in `.env.<APP_ENV>` (`.env.staging`, `.env.production`, `.env`), copied from `.env.example`.
`scripts/gen-env.js` turns them into `src/config/env.generated.ts` (git-ignored), which is bundled into the app.
**Everything in there is public.** Never put a service-role key, a signing key or any backend secret in it. The Supabase anon key is public by design.

| Variable | Meaning |
|---|---|
| `API_BASE_URL` | Go API (`kwala-intel-app`), used for `GET /auth/me/context` |
| `AI_API_BASE_URL` | Chat service: sessions, history, SSE chat |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | OTP sign-in |
| `WEB_BASE_URL` | Website for plan / legal links |
| `USE_MOCK_BACKEND` | Development only |

If any of the four backend values is missing the app opens normally but shows **"Backend not configured"** and disables sign-in.
Full endpoint list and response shapes: [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

## Build native apps
```
npm run ios:staging  |  npm run ios:production        # xcodebuild Release for the iOS Simulator
npm run android:staging  |  npm run android:production # APK in android/app/build/outputs/apk/<flavor>/release
```
Staging and production differ by id (`com.kwalaintel.mobile[.staging]`), by env file, and by **OTA channel**. For a device/App Store build, open
`ios/KwalaMobile.xcworkspace` in Xcode, set your team, and archive with the build setting `EXPO_CHANNEL=production` (or `staging`).

## Quality checks
```
npm run check    # tsc --noEmit, eslint, jest (what CI runs, plus a JS bundle build for both platforms)
```

## Project layout
```
src/api         HTTP + SSE transport, zod schemas, real backend, dev-only mock
src/auth        Supabase client, secure (Keychain/Keystore) session storage, AuthContext
src/chat        transcript reducer, session provisioner, useChat (send / stream / retry / reconcile)
src/components  Header, Composer, MessageItem, Markdown, banners, error boundary
src/screens     Chat, History, SignIn
src/theme       design tokens
docs/           API_CONTRACT, OTA_RUNBOOK, RELEASE_CHECKLIST
```

## Behaviour worth knowing
- **Guests** can open the app and see the starter prompts; sending asks them to sign in (the typed text stays in the box).
- **Send** is optimistic. A failed turn stays in the transcript with a *Try again* button; a refusal the user can't fix by retrying
  (daily limit, signed out) removes the bubble and puts the text back in the composer.
- **Streaming** uses `expo/fetch` (RN's built-in `fetch` cannot stream). Stop keeps the partial answer.
- **Scrolling**: the list is inverted, so new text grows at the bottom and doesn't drag a reader away from older messages.
- **Background / foreground**: when the app returns to the foreground it re-reads the chat from the server, so an answer that finished while away appears.
- **Logout** ends the session and clears chat state held in memory; no message content is persisted on the device.
- **Rich answers**: charts/widgets are not rendered in v1; the answer's text is, with a note pointing to the web app.

## Documentation
- [docs/OTA_RUNBOOK.md](docs/OTA_RUNBOOK.md): update channels, signing, publish, rollout, rollback
- [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md): blockers, decisions, known limitations
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md)

## Verified so far
See the bottom of this file (updated after each verification pass).
