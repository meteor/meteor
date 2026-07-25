# Native mobile smoke tests

Maestro flows verifying Meteor's native mobile shell. Builds a minimal Meteor
app for Cordova, installs it on an iOS Simulator or Android emulator, and asserts
that the app launches, the Meteor client renders, and DDP connects.

Sibling to `tools/e2e-tests/`. Isolated `package.json` so test dependencies never
contaminate the dev bundle's `node_modules`.

## Local usage

Prerequisites: Node 20+, Maestro CLI, Xcode (for iOS), Android SDK + emulator
(for Android). On a fresh checkout:

```sh
npm run install:native            # installs deps and checks for maestro CLI
npm run test:native:android       # alias for: npm run test:native -- --platform=android
npm run test:native:ios           # alias for: npm run test:native -- --platform=ios
```

The generic `npm run test:native -- --platform=<ios|android>` form also works; the
per-platform scripts above are just shorthands.

## Layout

| Path | Purpose |
|------|---------|
| `apps/smoke/` | Minimal Meteor app under test (committed source) |
| `flows/launch.yaml` | The single smoke flow |
| `scripts/run.js` | Entrypoint, wires the pipeline |
| `scripts/build-app.js` | `meteor add-platform` + `meteor build` |
| `scripts/server.js` | Starts `meteor run` and waits for ready |
| `scripts/simulator.js` | Boots iOS Simulator or Android emulator |
| `scripts/maestro.js` | Spawns Maestro and captures JUnit output |
| `scripts/check-maestro.js` | Preflight; prints install hint if Maestro missing |
| `junit/` | JUnit reports (gitignored, uploaded as CI artifact) |

## CI

See `.github/workflows/native.yml`. Runs nightly at 06:00 UTC and on PRs labeled
`mobile`.

## Troubleshooting

**iOS: `IOSDriverTimeoutException` / "iOS driver not ready in time".** Maestro's
iOS XCUITest driver binds an HTTP server on port **7001**, and that port is
hardcoded (no CLI flag or env override). If another process on the host already
holds `127.0.0.1:7001` the driver cannot bind (`EADDRINUSE`), and the run fails
in an opaque timeout after the app is already built and installed. Find the
occupant with `lsof -nP -iTCP:7001 -sTCP:LISTEN`, free port 7001, and re-run.
