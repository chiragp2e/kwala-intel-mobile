# Release checklist: blockers and decisions

## Blockers (cannot ship without these)
1. **Backend credentials** for each environment: `API_BASE_URL`, `AI_API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
   Until set, the app shows "Backend not configured" and sign-in is disabled. Nothing falls back to mock data in staging/production.
2. **Confirm Supabase allows email + phone OTP for the mobile client** (same project as the web app) and that the SMS hook (MSG91) is unchanged.
3. **EAS project** (account, project id, update URL) and moving the signing private key into a secret manager (see OTA_RUNBOOK).
4. **Bundle id / package** `com.kwalaintel.mobile` is a placeholder choice. Confirm, or change in `app.json`, `ios` project and `android/app/build.gradle`, before creating store listings.
5. **Android release signing**: release builds use the debug keystore. Create an upload keystore (outside git) and a real `signingConfig`.
6. **iOS signing**: team, provisioning, push entitlements (none needed yet). Builds so far target the simulator only.
7. **App icons and launch screen** are still the React Native defaults.

## Decisions needed
- **Google sign-in** is not in v1 (needs OAuth deep links + native config). Email and phone OTP only.
- **Payments**: not in the app. When a free user hits the daily limit the card links to `WEB_BASE_URL/pricing`. Apple/Google policies
  restrict steering to external purchase and differ by region; check current rules (or add in-app purchase) before store review.
- **Crash reporting vendor**: none wired. Plug one into `src/lib/diagnostics.ts` (`setReporter`), keep message bodies out of reports.
- **Voice input, charts/visual blocks, wallet, watchlist** exist in the web app and are intentionally out of scope. Answers with
  charts show a note pointing to the web app.
- Retention: no message content is stored on the device. History is read from the server on demand; only the auth session is
  stored (Keychain / Keystore). Sign-out clears the session and in-memory chat state.

## Known limitations
- Retrying a failed send may create a duplicate user turn on the server if the first attempt reached it. The chat endpoint has no
  documented idempotency key, so none is sent.
- Fonts are system fonts (the web app uses Geist / Newsreader); icons are text glyphs. Visual match is close, not pixel-exact.
- `expo-updates` rollback does not protect against every runtime failure (see OTA_RUNBOOK).
