# apps/mobile — iOS client (`twitbruv`)

Native SwiftUI client for twitbruv. Talks to `apps/api` over HTTPS using
Better Auth cookie sessions. Built with Xcode 26+ and an iOS 26.4 deployment
target. **Not part of the Bun/Turbo build graph** — `bun run typecheck`,
`bun run lint`, and `bun run build` do not touch this directory.

## Open the project

```bash
open apps/mobile/twitbruv.xcodeproj
```

The project uses `PBXFileSystemSynchronizedRootGroup`, so any `.swift` file
added under `apps/mobile/twitbruv/` is automatically part of the build target.

## Run against local services

1. From repo root, start backing services and the API:

   ```bash
   bun run services:up
   bun run dev
   ```

   Confirm the API is on `http://localhost:3001` and the web on
   `http://localhost:3000`.

2. Make sure your local `.env` has `twitbruv-ios://app` in
   `AUTH_TRUSTED_ORIGINS` (the value `.env.example` ships with). Without this,
   any non-GET request from the iOS app will be rejected by
   `requireSameOrigin` with `403 invalid_origin`.

3. In Xcode, pick an **iOS 26.4** simulator and Cmd-R. The DEBUG build points
   at `http://localhost:3001` (see `App/Config.swift`). Release builds default
   to `https://api.ak2.dev` (API) and `https://ak2.dev` (web). To override, set
   the `API_BASE_URL` and `WEB_BASE_URL` Info.plist entries via build settings
   or an `.xcconfig`.

   The DEBUG `Info.plist` includes an `NSAppTransportSecurity` exception for
   `localhost` and `127.0.0.1` so HTTP traffic to the dev API is allowed.
   Release builds require HTTPS.

## Auth

The app uses cookie sessions managed by `URLSession`'s shared
`HTTPCookieStorage`. After sign-in the `session_token` cookie is persisted to
disk and survives relaunch. v1 sign-in surfaces:

- Email + password
- Magic link (request only — link itself opens in Safari and falls back into
  the app once the cookie is set; Universal Links can be wired later)
- OAuth via `ASWebAuthenticationSession` (GitHub / Google / GitLab) using the
  custom `twitbruv-ios://auth/done` callback scheme
- 2FA challenge (TOTP + backup code)

Passkey enrolment, password reset, and email-verification deep links are
deferred to a follow-up.

## Production checklist

Before pointing the app at a non-local environment:

1. Add the mobile origin to `AUTH_TRUSTED_ORIGINS` for that environment:

   ```
   AUTH_TRUSTED_ORIGINS=...,twitbruv-ios://app
   ```

   Without this the API rejects every mutation from the app.

2. Confirm `AUTH_COOKIE_DOMAIN` for the API host the app is calling. The app
   relies on `Set-Cookie` from the API; if the cookie scope is wrong the app
   will silently sign you out on next launch.

3. Build with `Release` to compile out the localhost ATS exception. Override
   `API_BASE_URL` / `WEB_BASE_URL` via build settings if the URLs differ from
   the defaults baked into `Config.swift`.

4. **Push (APNs):** Enable the Push Notifications capability in Xcode for your
   team if it is not already applied. Debug builds use
   `twitbruv/twitbruv.entitlements` (`aps-environment` = development); Release
   uses `twitbruv-release.entitlements` (production). Run `bun run db:push`
   locally so the `device_tokens` table exists. Configure `APNS_*` in `.env`
   for `apps/worker` (see root `.env.example`).

## Out of scope for v1

- Bearer / API-key auth — cookie sessions only
- Article composition (read-only viewer; write on web)
- Chess, admin, analytics dashboard, GitHub connector, ActivityPub
- Offline storage / SwiftData persistence
