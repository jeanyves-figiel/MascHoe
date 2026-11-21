# Runbook: iOS TestFlight builds (#31)

Beta testers install the real app from TestFlight. Builds point at **staging** (`https://staging.thirstr.fun`).

## How it works
- `.github/workflows/ios-testflight.yml` runs on every push to `main` touching `apps/mobile/**`, or manually (Actions → iOS TestFlight → Run workflow).
- GitHub macOS runner (owner choice 2026-11-17: no Expo cloud): `npx expo prebuild -p ios` generates the native project (env `EXPO_PUBLIC_API_URL=https://staging.thirstr.fun`), `xcodebuild archive` signs with Xcode automatic signing (`-allowProvisioningUpdates` + App Store Connect API key, so Apple creates/keeps the distribution certificate and profile), then `xcodebuild -exportArchive` with `destination=upload` sends it to App Store Connect. Build number = run number + 100. Apple processes the build (~5–15 min) and it appears in TestFlight.
- Without the secrets below the workflow skips with a warning; nothing fails.

## Current values (2026-11-17)
- Team ID `U7VAR53G86` (Individual), App ID `app.thirstr` (Sign in with Apple, Associated Domains), App Store Connect app `6835938923`, API key `Thirstr CI` (App Manager).

## One-time owner setup
| Item | Where | Goes to |
|---|---|---|
| Apple Developer Program membership | developer.apple.com | — |
| Team ID | developer.apple.com → Membership | GitHub secret `APPLE_TEAM_ID`; also `APPLE_TEAM_ID` in `infra/fly/api-staging.toml` (public value) |
| Team type, if a company account | — | GitHub variable `APPLE_TEAM_TYPE=COMPANY_OR_ORGANIZATION` (default `INDIVIDUAL`) |
| App record: iOS, name Thirstr, bundle ID `app.thirstr` | App Store Connect → Apps → + | its Apple ID number → GitHub secret `ASC_APP_ID` |
| API key, role App Manager | App Store Connect → Users and Access → Integrations → App Store Connect API | `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_KEY_P8` (full .p8 text) |
| Internal tester | App Store Connect → TestFlight → Internal Testing | yourself |

GitHub secrets: repo → Settings → Secrets and variables → Actions.

## Sign-in on TestFlight builds
- **Sign in with Apple**: works once the app record exists (capability from `ios.usesAppleSignIn` via prebuild). Server checks `aud` = `app.thirstr`.
- **Passkeys**: need `APPLE_TEAM_ID` on staging so `/.well-known/apple-app-site-association` lists `<TeamID>.app.thirstr`. Apple caches this file; a fresh install picks it up.
- **Google / email link**: hidden on native until Google client IDs and SMTP exist (#26). Flip with `EXPO_PUBLIC_AUTH_GOOGLE=1` / `EXPO_PUBLIC_AUTH_EMAIL=1` in the workflow `env`.

## App extensions (#119)
- `apps/mobile/targets/safety-live` is a widget extension (date check-in Live Activity), added at `expo prebuild` by `@bacons/apple-targets`. Bundle ID `app.thirstr.safetylive`; automatic signing (`-allowProvisioningUpdates` + API key) registers it and makes its profile on the first build. It signs with `APPLE_TEAM_ID` (read into `ios.appleTeamId` by `app.config.js`).
- Swift in `targets/safety-live/SafetyAttributes.swift` must stay identical to `modules/thirstr-safety/ios/SafetyAttributes.swift` (a Jest test checks).

## Troubleshooting
- Build logs: the workflow run (Archive step prints the last 200 xcodebuild lines).
- Signing errors about cloud-managed certificates: the API key may need the Admin role; create a new key and update `ASC_KEY_ID` / `ASC_KEY_P8`.
- "Missing compliance": answered in-app (`ITSAppUsesNonExemptEncryption = false`).
- Passkey sheet says the app is not associated: check `curl https://staging.thirstr.fun/.well-known/apple-app-site-association` and the Team ID.
