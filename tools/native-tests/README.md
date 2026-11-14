# Native mobile tests

Maestro flows verifying Meteor's native mobile shell. The default `capacitor-tests`
app is a Capacitor target that runs on an iOS Simulator or Android emulator,
loads the generated native webDir, and asserts native launch, minimal rendering,
CSS delivery, DDP connectivity, Capacitor runtime availability,
`WebAppLocalServer` shim behavior, and `__cordova` path adaptation.

Sibling to `tools/e2e-tests/`. Isolated `package.json` so test dependencies never
contaminate the dev bundle's `node_modules`.

This suite is not a browser E2E duplicate. Browser/build artifact coverage stays
in `tools/e2e-tests`; this suite proves native build, simulator, WebView, and DDP
stability.

The default Capacitor run mode exercises `meteor run android|ios`. Build mode
uses `meteor build --directory --platforms=<platform> --server=<LAN URL>` to
produce production web assets, compiles a native debug shell around those
assets, starts the Meteor server at the embedded mobile server URL, installs the
app, and runs the same Maestro assertions. E2E tests still own generated-file
assertions; build-mode native tests prove the production bundle boots in a real
WebView and connects back to the server.

## Local usage

Prerequisites: Node 22+, Maestro CLI, Xcode 26+ with an iOS Simulator (for iOS),
JDK 21 and Android SDK 36 with an emulator (for Android). New Capacitor 8 iOS
projects use Swift Package Manager; the runner also accepts existing CocoaPods
workspaces. Use `MAESTRO_IOS_DEVICE` to select an installed simulator by name
(CI uses `iPhone 17`).

For a fresh Xcode installation, install its matching iOS platform component
with `xcodebuild -downloadPlatform iOS`. An older simulator runtime alone does
not enable the new Xcode build destinations.

On a fresh checkout:

```sh
npm run install:native            # installs deps and checks for maestro CLI
npm run test:native:android       # alias for: npm run test:native -- --platform=android
npm run test:native:ios           # alias for: npm run test:native -- --platform=ios
npm run test:native:capacitor:android
npm run test:native:capacitor:ios
npm run test:native:capacitor:android:run    # bundled meteor run + HCP update flow
npm run test:native:capacitor:ios:run        # bundled meteor run + HCP update flow
npm run test:native:capacitor:android:build  # production meteor build + Android emulator
npm run test:native:capacitor:ios:build      # production meteor build + iOS Simulator
npm run test:native:capacitor:android:livereload
npm run test:native:capacitor:ios:livereload
npm run test:native:capacitor:android:hcp    # production build + HCP update flow
npm run test:native:capacitor:ios:hcp        # production build + HCP update flow
```

The generic `npm run test:native -- --platform=<ios|android>` form also works; the
per-platform scripts above are just shorthands.

The Cordova smoke fixture remains available and exercises both initial launch
and a real hot-code update:

```sh
cd tools/native-tests
node scripts/run.js --platform=android --app=smoke
```

The Cordova fixture uses this checkout's
`npm-packages/cordova-plugin-meteor-webapp`. After `launch.yaml` passes, the
runner mutates the temporary fixture, waits for its Cordova manifest version to
change, and runs `hcp-updated.yaml`. Publishing plugin changes still requires
publishing the plugin and updating `packages/webapp`'s `Cordova.depends` pin.

For debugging, keep the temporary app and simulator running:

```sh
cd tools/native-tests
node scripts/run.js --platform=android --keep-running
```

## Layout

| Path | Purpose |
|------|---------|
| `apps/capacitor-tests/` | Default Capacitor app under test |
| `apps/smoke/` | Legacy Cordova smoke fixture |
| `flows/capacitor-tests.yaml` | Default Capacitor runtime flow |
| `flows/launch.yaml` | Cordova initial render/runtime/style/DDP/route assertions |
| `flows/hcp-updated.yaml` | Cordova updated render/runtime/DDP/HCP assertions |
| `scripts/cordova-hcp.js` | Cordova fixture mutation and manifest change helpers |
| `scripts/run.js` | Entrypoint, wires the pipeline |
| `scripts/build-app.js` | Prepares app fixtures and native platforms |
| `scripts/server.js` | Starts `meteor run` and waits for ready |
| `scripts/simulator.js` | Boots iOS Simulator or Android emulator |
| `scripts/maestro.js` | Spawns Maestro and captures JUnit output |
| `scripts/check-maestro.js` | Preflight; prints install hint if Maestro missing |
| `junit/` | JUnit reports (gitignored, uploaded as CI artifact) |

## Default app assertions

`flows/capacitor-tests.yaml` treats these visible strings as test API:

- `Welcome to Meteor Capacitor Tests`
- `Native render ready`
- `Style preserved`
- `DDP verified`
- `window.Capacitor available`
- `Meteor.isCapacitor true`
- `Capacitor native platform ready`
- `Device plugin ready: native`
- `App plugin ready: com.meteor.capacitortests`
- `WebAppLocalServer shim ready`
- `WebAppLocalServer native bridge ready` or `WebAppLocalServer livereload shim ready`
- `HCP check requested`
- `HCP update ready`
- `HCP reload executed`
- `__cordova paths adapted`

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
