# Kwala Intel mobile

A minimal, chat-first React Native app for Kwala Intel: sign in with Google, email OTP or mobile OTP, ask market questions, read
streamed answers, revisit past chats. It talks to the **same backend as the web app** (Supabase auth, the Go API, and the
chat service); it has no backend of its own.

- React Native Community CLI, TypeScript (strict), Android + iOS. `ios/` and `android/` are normal native projects.
- **Versions:** React Native 0.83.10, React 19.2, Expo SDK 55 modules (`expo-updates`, `expo-secure-store`, `expo-crypto`, …).
  *Why not SDK 58 / RN 0.88 (newest):* SDK 56+ builds a Swift 6.2 package and needs **Xcode 26**; the Mac this was built on has
  Xcode 16.4. SDK 55 builds with Xcode 16.4. Upgrade to the newest SDK once Xcode 26 is installed (and Apple requires Xcode 26 for
  App Store uploads anyway). Upgrade steps: bump `expo` and run `npx expo install --fix`, re-run `install-expo-modules`, `pod install`.
- Dark theme only (the supplied designs are dark). Fonts match the web app: Geist for UI text, JetBrains Mono for numbers and labels, Newsreader for the empty-chat headline (`@expo-google-fonts/*`, loaded with `expo-font` and also bundled in `android/app/src/main/assets/fonts`); if one fails to load the system font is used.

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
so the UI can be shown; a message containing "chart" gets one of every chart type instead (`src/api/mockBlocks.ts`). Staging
and production builds ignore it.

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
src/components  Header, HistoryDrawer, Composer, MessageItem, ActivityFeed, Markdown, ConfirmDialog, banners
src/screens     Chat, Pricing, Profile, About, Notifications, SignIn
modules/        kwala-background: native keep-alive for a streaming answer (iOS background task, Android foreground service)
                and the "Your answer is ready" notification; kwala-google: iOS Google sign-in with our own nonce
src/theme       design tokens
docs/           API_CONTRACT, OTA_RUNBOOK, RELEASE_CHECKLIST
```

## Behaviour worth knowing
- **Guests** can open the app and see the starter prompts; sending asks them to sign in (the typed text stays in the box).
- **Send** is optimistic. A failed turn stays in the transcript with a *Try again* button; a refusal the user can't fix by retrying
  (daily limit, signed out) removes the bubble and puts the text back in the composer.
- **Streaming** uses `expo/fetch` (RN's built-in `fetch` cannot stream). Stop keeps the partial answer.
- **Scrolling**: the list is inverted, so new text grows at the bottom and doesn't drag a reader away from older messages.
- **History drawer**: swipe right on the conversation to pull it open and left (on the panel or the dimmed chat) to push it
  closed; it follows the finger and settles past a third of its width or on a flick (`src/components/drawerSwipe.ts`). A swipe
  only becomes the drawer's once it is clearly sideways, so the chat still scrolls and a chart being scrubbed keeps its drag.
  The swipe area takes each touch as it starts, because Android sends JS a touch's moves only once something has taken it.
- **Charts** answer a touch as the web's do on hover: a crosshair or shaded column and a tooltip with the web's content (every
  series at a bar's category, a histogram bucket's count, a waterfall step and running total, the scatter dot nearest the
  finger, a box's five numbers, a pie slice's value and share, a funnel stage). Line and candlestick charts also pinch-zoom.
- **Research this further**: every block that is a subject (charts, card widgets, prose) has the web's microscope button in
  its corner; it sends the block back in words as the next message (`src/blocks/lib/describe.ts`, ported from the web).
- **Copy**: a long press on a message copies all of it (your own message, or the answer as the copy button does) and says
  "Copied"; there is no text-selection menu. Screen readers get the same as a "Copy message" action.
- **Sign in** opens with the keyboard down, so Apple, Google and the phone/email form are all visible (MOB-12).
- **Adding a mobile number** (Profile, "Add number" / "Verify now"): as on the web, `supabase.auth.updateUser({ phone })` texts
  a code and `verifyOtp({ type: 'phone_change' })` stores the number once the code checks out; then the session is refreshed
  (the old session is revoked if Supabase issued a new one) and `PUT /auth/me/phone` tells the Go API, whose cached account
  context would otherwise show the old number for up to a minute. A number on another account is refused before any SMS.
- **Background / foreground**: while an answer streams the app holds it open in the background (`modules/kwala-background`: a
  short foreground service with a "Finishing your answer…" notification on Android, which otherwise cuts a backgrounded app's
  network at once; a ~30s background task on iOS). If the stream still drops, the app shows "Reconnecting…" and, back in the
  foreground, polls the session for up to two minutes for the finished answer before offering *Try again*. The AI service
  does not currently finish or store a turn whose client disconnected, so on iOS an absence longer than ~30s still ends in *Try again*.
- **Answer ready**: an answer that finishes while the app is in the background posts "Your answer is ready" with the
  question (tap opens the app). Permission is asked when the first question of a launch is sent (iOS asks once ever,
  Android 13+ at most twice). Android's icon is the Kwala mark as a vector (`modules/kwala-background/.../kwala_notification.xml`).
- **Google sign-in on iOS** goes through `modules/kwala-google`, not the library's `signIn()`: GoogleSignIn otherwise puts a
  random nonce of its own in the ID token, and Supabase refuses a token whose nonce it isn't given. The app sends Google
  the SHA-256 of a fresh nonce and Supabase the raw value, as for Apple. Android tokens carry no nonce.
- **iOS scenes**: the window is created in `SceneDelegate` (in `AppDelegate.swift`, with `UIApplicationSceneManifest` in
  Info.plist). Apps built with the iOS 27 SDK must use the scene life cycle or iOS 27 stops them at launch. The scene
  delegate passes life-cycle events and opened URLs on to `AppDelegate`, where Expo's subscribers listen.
- **Voice**: hold the mic to talk and let go to send, or tap to start and tap again to stop and edit. The clip (mono AAC, max 58s)
  goes to the AI service's `POST /api/transcribe`, as on the web.
- **Notifications**: the bell reads the in-app inbox (`/notifications` on the Go API) on open, on foreground and every 5 minutes.
  Native push is not wired up yet.
- **Logout** ends the session and clears chat state held in memory; no message content is persisted on the device.
- **Pricing** loads live plans from `/billing/plans` (prices, GST split, annual saving). Checkout runs in Razorpay's native sheet (`react-native-razorpay`, key from `RAZORPAY_KEY_ID`, test key on staging), then `/billing/checkout/verify` and a poll of `/billing/subscription`. A binary without the native module, or a key that doesn't match the backend's, falls back to Razorpay's hosted page in an in-app browser tab.
- **Green buttons** share one shine effect (`src/components/Shine.tsx`): static gloss plus a periodic sweep, off when Reduce Motion is on.
- **Charts**: drawn natively (react-native-svg). Line and candlestick charts have a touch tooltip (hold and drag), pinch / +/- zoom with the y-axis re-fitting, and every chart has a download button that shares the card as a PNG (`react-native-view-shot` + `expo-sharing`; the button hides itself on a build without those modules).
- **Daily limit**: when the free questions run out the app shows an upgrade modal (usage, a live countdown to the reset, what Pro adds) and keeps the typed question in the box.

## Documentation
- [docs/OTA_RUNBOOK.md](docs/OTA_RUNBOOK.md): update channels, signing, publish, rollout, rollback
- [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md): blockers, decisions, known limitations
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md)

## Verified so far
See the bottom of this file (updated after each verification pass).

### Verified (2026-10-28, this machine: macOS 15, Xcode 16.4, Android SDK 36, JDK 21)
| Check | Result |
|---|---|
| `tsc --noEmit`, `eslint .`, `jest` (73 tests) | pass |
| iOS Release build for the Simulator (iPhone 16 Pro) | builds, launches from the embedded `main.jsbundle` with no Metro |
| iOS built `Expo.plist` | channel = `staging` (set by the build phase), runtime `1.0.0`, check-on-launch ALWAYS, launch wait 0; `EXUpdates.bundle/app.manifest` embedded |
| Android `assembleStagingRelease` | builds; installs and launches on the Pixel 9 Pro emulator |
| Android mock chat turn (tap prompt -> optimistic bubble -> streamed Markdown answer) | works |

Staging backend (`.env.staging`, git-ignored, public values only): `GET /health` on both services returns 200, `/api/sessions` and `/auth/me/context` return 401 without a token, and Supabase reports email and phone OTP enabled. The staging build (`APP_ENV=staging`) shows no "not configured" banner and opens the sign-in screen.

**Not verified** (and why):
- A signed-in session against staging: OTP codes go to a real inbox / phone, so sign-in, history, delete, the quota caption and the real SSE stream have only been exercised by unit tests against mocked `fetch`.
- Sign-in and History screens were not looked at on a device (no UI automation on iOS here; the Android emulator was only driven through the chat screen).
- OTA delivery, runtime-version rejection, rollback: need an EAS project. The embedded-bundle launch was checked; the simulator had network, so a true airplane-mode launch was not.
- iOS on a physical device / archive, Android release signing, Google Play / App Store requirements.
- Screenshot comparison was visual only against the guest-home reference; the landing, pricing and Ultra screenshots are web pages and have no mobile equivalent in v1.
