# Runbook: iOS TestFlight builds (#31)

Beta testers install the real app from TestFlight. Builds point at **staging** (`https://thirstr-api-staging.fly.dev`).

## How it works
- `.github/workflows/ios-testflight.yml` runs on every push to `main` touching `apps/mobile/**`, or manually (Actions → iOS TestFlight → Run workflow).
- EAS Build (Expo's macOS builders) compiles profile `staging` from `apps/mobile/eas.json`, bumps the build number (remote), signs with certificates EAS creates and stores from the App Store Connect API key, then auto-submits to App Store Connect. Apple processes the build (~5–15 min) and it appears in TestFlight.
- Without the secrets below the workflow skips with a warning; nothing fails.

## One-time owner setup
| Item | Where | Goes to |
|---|---|---|
| Apple Developer Program membership | developer.apple.com | — |
| Team ID | developer.apple.com → Membership | GitHub secret `APPLE_TEAM_ID`; also `APPLE_TEAM_ID` in `infra/fly/api-staging.toml` (public value) |
| Team type, if a company account | — | GitHub variable `APPLE_TEAM_TYPE=COMPANY_OR_ORGANIZATION` (default `INDIVIDUAL`) |
| App record: iOS, name Thirstr, bundle ID `app.thirstr` | App Store Connect → Apps → + | its Apple ID number → GitHub secret `ASC_APP_ID` |
| API key, role App Manager | App Store Connect → Users and Access → Integrations → App Store Connect API | `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_KEY_P8` (full .p8 text) |
| Expo account + access token | expo.dev → Settings → Access tokens | `EXPO_TOKEN` |
| Internal tester | App Store Connect → TestFlight → Internal Testing | yourself |

GitHub secrets: repo → Settings → Secrets and variables → Actions.

## Sign-in on TestFlight builds
- **Sign in with Apple**: works once the app record exists (capability is set by EAS from `ios.usesAppleSignIn`). Server checks `aud` = `app.thirstr`.
- **Passkeys**: need `APPLE_TEAM_ID` on staging so `/.well-known/apple-app-site-association` lists `<TeamID>.app.thirstr`. Apple caches this file; a fresh install picks it up.
- **Google / email link**: hidden on native until Google client IDs and SMTP exist (#26). Flip with `EXPO_PUBLIC_AUTH_GOOGLE=1` / `EXPO_PUBLIC_AUTH_EMAIL=1` in the EAS profile.

## Troubleshooting
- Build logs: link printed in the workflow log, or expo.dev → project `thirstr` → Builds.
- "Missing compliance": answered in-app (`ITSAppUsesNonExemptEncryption = false`).
- Passkey sheet says the app is not associated: check `curl https://thirstr-api-staging.fly.dev/.well-known/apple-app-site-association` and the Team ID.
