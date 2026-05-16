# iOS app (`twitbruv`)

Open `twitbruv.xcodeproj` in Xcode. Root `bun run typecheck`, `lint`, and `build` do **not** compile Swift — the mobile app is not part of the Bun/Turbo build graph.

## Run alongside API + worker

From the repository root:

```bash
bun run dev:mobile
```

This starts `api` + `worker` via `turbo dev` and, in parallel, builds the iOS app, installs it on the currently booted simulator (falling back to `iPhone 17 Pro Max`), and launches it. Ctrl+C stops the API and worker; the app keeps running in the simulator.

Build artifacts go to `apps/mobile/DerivedData/` (gitignored). To skip the parallel iOS step and only run the backend, use `bun run dev:api`.

## Unit tests

From the repository root:

```bash
xcodebuild \
  -project apps/mobile/twitbruv.xcodeproj \
  -scheme twitbruv \
  -destination 'generic/platform=iOS Simulator' \
  test
```

Use `-quiet` for less log noise once the project is healthy locally.

## Local API / web URLs

Debug defaults match `Config`: API `http://localhost:3001`, web `http://localhost:3000`. Override with `API_BASE_URL` and `WEB_BASE_URL` in the app `Info.plist` if needed.
