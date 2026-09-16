# Native mobile smoke tests

Maestro flows verifying Meteor's Cordova mobile shell. The runner builds a
minimal Meteor app, installs it on an iOS Simulator or Android emulator, and
checks rendering, computed styles, Cordova runtime APIs and asset paths, DDP,
route reloads, and hot code push (HCP).

Sibling to `tools/e2e-tests/`. Isolated `package.json` so test dependencies never
contaminate the dev bundle's `node_modules`.

## Local usage

Prerequisites: Node 20.17.0+, Maestro CLI, Xcode (for iOS), Android SDK +
emulator (for Android). Cordova Android 15 requires Android SDK Platform 36
and Build Tools 36.0.0. Install the latter with
`sdkmanager 'build-tools;36.0.0'` if needed.
On a fresh checkout:

```sh
npm run install:native            # installs deps and checks for maestro CLI
npm run test:native:android       # alias for: npm run test:native -- --platform=android
npm run test:native:ios           # alias for: npm run test:native -- --platform=ios
```

The generic `npm run test:native -- --platform=<ios|android>` form also works; the
per-platform scripts above are just shorthands.

Each run has two phases:

1. Build and install the initial native app, then run `launch.yaml`.
2. Mutate the temporary fixture while `meteor run` stays active, wait for the
   Cordova manifest version to change, and run `hcp-updated.yaml` against the
   app after its native HCP reload.

The temporary app is configured to use this checkout's
`npm-packages/cordova-plugin-meteor-webapp`, so changes to the native plugin are
compiled and exercised without publishing a package first. Shipping those
changes still requires publishing that plugin version and then updating
`packages/webapp`'s `Cordova.depends` pin.

## Layout

| Path | Purpose |
|------|---------|
| `apps/smoke/` | Minimal Meteor app under test (committed source) |
| `flows/launch.yaml` | Initial render/runtime/style/DDP/route assertions |
| `flows/hcp-updated.yaml` | Updated render/runtime/DDP/HCP assertions |
| `scripts/run.js` | Entrypoint, wires both phases |
| `scripts/cordova-hcp.js` | Fixture mutation and manifest change helpers |
| `scripts/build-app.js` | `meteor add-platform` + `meteor build` |
| `scripts/server.js` | Starts `meteor run` and waits for ready |
| `scripts/simulator.js` | Boots iOS Simulator or Android emulator |
| `scripts/maestro.js` | Spawns Maestro and captures JUnit output |
| `scripts/check-maestro.js` | Preflight; prints install hint if Maestro missing |
| `junit/` | Per-phase JUnit reports and device logs (gitignored, uploaded as CI artifacts) |

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
