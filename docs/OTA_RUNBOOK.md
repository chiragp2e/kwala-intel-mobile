# OTA updates runbook (expo-updates + EAS Update)

One OTA system only: `expo-updates`, installed into this React Native CLI project. `ios/` and `android/`
stay the source of truth and are built locally (no EAS Build needed).

## What an OTA update can and cannot change
- **Can:** JavaScript/TypeScript and bundled assets (images, fonts) that are compatible with the installed native binary.
- **Cannot:** native dependencies, permissions, entitlements, `Info.plist` / `AndroidManifest.xml`, native config, app icon,
  anything that changes the native module set. Those need a **new store release** and a **new runtime version**.
- Apple (guideline 2.5.2) and Google Play allow downloading interpreted code that does not change the app's primary purpose.
  Re-check both policies before each major release; they change.

## How it is wired
| Concern | Where |
|---|---|
| Update URL, runtime version, channel, signing cert | `app.json` -> `expo.*`, synced into `Expo.plist` / `AndroidManifest.xml` |
| Launch behaviour | `checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`: the app starts on the embedded/cached bundle immediately, checks and downloads in the background; the download is used on the **next cold start**. The app never calls `reloadAsync`, so an open chat is never reloaded. |
| Channels per native build | Android: product flavors `staging` / `production` set `${expoChannel}` in the manifest. iOS: the "Set Expo update channel" build phase writes `EXPO_CHANNEL` (default `production`) into the built `Expo.plist`. |
| Runtime compatibility | `expo.runtimeVersion` = `"1.0.0"` (string). An update only reaches binaries with the identical runtime version. |
| Signature verification | `certs/certificate.pem` (public) is embedded in the app; updates are signed with the private key at publish time. Client rejects unsigned/badly signed updates. |
| Embedded bundle | Built into every binary (`export:embed`), so the app launches with no network. |

## Runtime version rules
Bump `expo.runtimeVersion` in `app.json` (then run the sync below) **whenever the native side changes**: new/upgraded native
module, SDK / React Native upgrade, permission, plist/manifest edit. Check with:
```
npm run fingerprint          # prints a hash of everything native; if it changed since the last release, bump runtimeVersion
npm run runtime:check
```
Never publish an update from a branch whose native fingerprint differs from the store binary's.

## One-time setup (needs the Kwala Expo account: not done here)
1. `npx eas-cli login`, then `npx eas-cli init` (creates the EAS project; note the project id).
2. Put `https://u.expo.dev/<PROJECT_ID>` in `app.json` -> `expo.updates.url`.
3. Sync native config, then **re-apply the two manual edits below** (the sync overwrites them):
   ```
   npx expo-updates configuration:syncnative --platform ios --workflow generic
   npx expo-updates configuration:syncnative --platform android --workflow generic
   ```
   - `AndroidManifest.xml`: the `UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY` value must be `{"expo-channel-name":"${expoChannel}"}`.
   - `Expo.plist`: leave `expo-channel-name` as `production`; the build phase overrides it.
4. Signing key: the private key lives at `~/.kwala-ota-keys/private-key.pem` on the machine that generated it. **Move it to
   your secret manager** (1Password / AWS Secrets Manager) and delete stray copies. It must never enter git, an app bundle or CI logs.
   The certificate is valid 10 years (generated 2026-10-28); losing the key means shipping a new binary with a new certificate.

## Building binaries
```
npm ci
# iOS (simulator Release build shown; archive for devices in Xcode as usual)
npm run ios:staging        # APP_ENV=staging,  channel=staging,    id com.kwalaintel.mobile.staging
npm run ios:production     # APP_ENV=production, channel=production, id com.kwalaintel.mobile
# Android
npm run android:staging    # -> android/app/build/outputs/apk/staging/release
npm run android:production
```
Create `.env.staging` / `.env.production` first (see README). Android release builds are currently signed with the
debug keystore: **replace with a real upload keystore before any store upload.**

## Publish to staging, validate, then production
```
# 1. staging
APP_ENV=staging node scripts/gen-env.js
npx eas-cli update --channel staging --branch staging --platform all \
  --private-key-path ~/.kwala-ota-keys/private-key.pem -m "fix: <what>"
# 2. validate on a staging build (installed from `npm run *:staging`): cold start twice, confirm the new behaviour.
# 3. production, 10% first
APP_ENV=production node scripts/gen-env.js
npx eas-cli update --channel production --branch production --platform all \
  --private-key-path ~/.kwala-ota-keys/private-key.pem --rollout-percentage 10 -m "fix: <what>"
# 4. watch crash/diagnostic reports and support for a day, then widen
npx eas-cli update:edit <GROUP_ID> --rollout-percentage 50
npx eas-cli update:edit <GROUP_ID> --rollout-percentage 100
```
(`update:edit --rollout-percentage` / `channel:rollout` exist in eas-cli 26.0.0. Re-run `npx eas-cli update --help` for the
installed version before relying on a flag. The JS env file used at publish time is baked into the update, so always
generate the matching `APP_ENV` first.)

## Monitoring
- EAS dashboard: update group, platform, runtime version, rollout %, download counts.
- App diagnostics: `src/lib/diagnostics.ts` has the single plug-in point for a crash reporter (not chosen yet; see
  RELEASE_CHECKLIST). Upload source maps per update with `--upload-source-maps`.
- Add the update id (`Updates.updateId`) to crash reports once a reporter is chosen.

## Rollback
Pick the smallest tool that works:
```
# Roll the latest update group back to the previous group (or to the embedded bundle if there is none)
npx eas-cli update:rollback <LATEST_GROUP_ID> --private-key-path ~/.kwala-ota-keys/private-key.pem
# Or republish a specific known-good group to the channel
npx eas-cli update:republish --channel production --group <GOOD_GROUP_ID> --private-key-path ~/.kwala-ota-keys/private-key.pem
# If it is still in a partial rollout: end it
npx eas-cli channel:rollout production --action end --outcome revert
```
Rollback is delivered the same way as any update: devices pick it up on their **next launch check and then next cold start**.
It does not reach devices that never reconnect, and it cannot fix users who are already crashing on launch before the
check can run.

## What the provider's recovery does and does not do
- If a **downloaded** update fails to launch (native/JS error before the app is up), `expo-updates` falls back to the previously working update or the embedded bundle on the next launch. It does **not** catch every runtime failure: a crash after the app has started
  normally, bad data, or a logic bug in a screen is not auto-reverted. Use rollout percentages and the rollback commands above.
- A user must be online once for the update to arrive; a binary with no network keeps running the embedded bundle.
- A blocked/expired certificate or wrong key means updates are rejected and the app keeps its current bundle (safe, but silent).

## Verification checklist for each release binary
1. Cold start with airplane mode on: app opens from the embedded bundle. (Done for the iOS simulator build; see README "Verified".)
2. Publish a staging update, open staging build online, force-quit, reopen: new behaviour present. **Not yet performed: needs an EAS project.**
3. Publish an update with a different `runtimeVersion`: the build must not receive it. **Not yet performed.**
4. Run the rollback command and confirm the previous behaviour returns after two cold starts. **Not yet performed.**
