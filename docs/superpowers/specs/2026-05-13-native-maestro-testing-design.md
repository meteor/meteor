# Native mobile smoke tests with Maestro

Status: approved
Date: 2026-05-13
Owners: Meteor core

## Goal

Add a CI-gated test surface that verifies a Meteor-built mobile app actually launches, renders its Meteor client, and connects via DDP, on both Android and iOS. Today the repo verifies the mobile build pipeline (`tools/tests/cordova-*.js` self-tests) but never boots the resulting app on a simulator or device. This spec fills that gap with a small, dedicated suite driven by [Maestro](https://maestro.dev).

## Non-goals

- Hot code push, plugin bridge, deep link, or push notification flows. Deferred until smoke coverage proves stable.
- Skeleton matrix coverage (react, vue, svelte, blaze). The mobile shell is framework-agnostic; one neutral smoke app exercises the whole pipeline.
- Capacitor wrapper support. Cordova is the only first-class wrapper in core today. The directory layout is platform-neutral so Capacitor can slot in later without renames.
- Real-device farm coverage (BrowserStack, Firebase Test Lab, Sauce Labs). Local simulators in CI are enough until they prove insufficient.
- Tests for user apps. This suite is for Meteor core CI, not a template shipped to users.

## Architecture

A new sibling directory under `tools/`, parallel to `tools/e2e-tests/` and `tools/unit-tests/`, isolated by its own `package.json` so its dependencies never leak into the dev bundle's `node_modules`.

```
tools/native-tests/
├── README.md
├── package.json              # deps: execa, fs-extra, wait-on (no jest)
├── apps/
│   └── smoke/                # purpose-built Meteor app, committed source
│       ├── .meteor/{packages,release}
│       ├── client/{main.html,main.js,main.css}
│       ├── server/main.js
│       ├── mobile-config.js
│       └── package.json
├── flows/
│   └── launch.yaml           # the only smoke flow (platform-neutral)
├── scripts/
│   ├── run.js                # entrypoint: node scripts/run.js --platform=ios|android
│   ├── build-app.js          # add-platform, meteor build
│   ├── simulator.js          # boot+wait helpers (xcrun for iOS, adb/emulator for Android)
│   ├── server.js             # meteor run, wait for ready
│   ├── maestro.js            # spawn maestro CLI, capture JUnit
│   └── check-maestro.js      # preflight: maestro --version, exit 1 with install hint
└── junit/                    # gitignored; uploaded as CI artifact
```

### Rationale for a sibling directory rather than a subfolder of `tools/e2e-tests/`

`tools/e2e-tests/` runs on any Linux runner: Jest plus headless Chromium via Playwright. A contributor on Linux can install and run it with no extra system dependencies.

Maestro for iOS needs macOS plus Xcode (about 15 GB). Maestro for Android needs JDK plus Android SDK plus emulator (about 10 GB). Mixing these into `tools/e2e-tests/` forces one of three bad choices:

1. Tag individual tests to skip on platform, fragile and surprising.
2. Split Jest into multiple projects, adds config complexity for no real gain.
3. Make Xcode and Android SDK preconditions for the existing E2E suite, punishes the majority of contributors who only touch the web layer.

A separate directory says "this needs different infra" structurally. CI runs `e2e-tests` on Linux and `native-tests` on a separate macOS plus Linux pair, with clean boundaries.

The two suites share a small amount of code (Meteor app scaffolding helpers). The plan is to import them via relative path from `tools/e2e-tests/helpers.js`. If cross-references grow past three or four helpers we extract a shared module then, not now.

### Rationale for a plain Node orchestrator rather than Jest

Jest's value is parallel test isolation and rich JS-level assertions. Neither applies:

- Only one simulator can run at a time per platform, so parallelism is bounded at 1.
- Maestro is the assertion engine. Flows are written in YAML; the Node side only orchestrates pass or fail.

A plain Node CLI ships about ten times fewer dependencies than a Jest setup, has no child-process foot-guns around long-lived server processes, and produces JUnit output that GitHub Actions parses natively via Maestro's own `--format=junit`.

## Components

Each script has one job; interfaces are spelled out so any one can be swapped without touching the others.

### `scripts/run.js`

Entrypoint, about 80 lines.

- Parses `--platform=ios|android` (required) and `--keep-running` (debug only, skips teardown).
- Calls the other scripts in order, propagates exit codes, ensures cleanup via `try/finally` on every step that allocates a resource.
- Exit codes:
  - `0`: flow passed
  - `1`: flow failed (this is the signal CI cares about)
  - `2`: infrastructure failure (simulator did not boot, LAN IP unresolvable, `meteor build` non-zero on unchanged source, Maestro CLI missing)
  - `3`: test framework bug (bad YAML, missing flow file)
- Hard timeout: 8 minutes per run. CI cancellation beats a 45-minute hang.

### `scripts/build-app.js`

About 100 lines.

- Public function: `prepareSmokeApp(platform) -> { appDir, mobileServerUrl }`.
- Copies `apps/smoke/` to `os.tmpdir()/native-smoke-<platform>-<runId>/` so the committed source never gets mutated.
- Runs `meteor add-platform <platform>` then `meteor build <out> --server <lanIp>:3000 --mobile-server <lanIp>:3000`.
- Returns absolute path to the `.apk` (Android) or `.app` bundle (iOS Simulator).
- Reuses `createMeteorApp`-style helpers from `tools/e2e-tests/helpers.js` via a relative import. No shared package yet.

### `scripts/server.js`

About 60 lines.

- Public function: `startServer(appDir, lanIp) -> { stop() }`.
- Runs `meteor run --port <lanIp>:3000` against the smoke app source (a separate copy from the build output so server iteration cannot contaminate the device-side bundle).
- Waits on `http://<lanIp>:3000` via `wait-on` before returning.
- Resolves a LAN IP automatically. iOS Simulator works with `localhost`, but Android emulator does not always, and a single routable address keeps the platforms on one code path.

### `scripts/simulator.js`

About 120 lines, the heaviest file.

- Public function: `bootSimulator(platform) -> { deviceId, install(bundle), uninstall(), shutdown() }`.
- iOS: `xcrun simctl boot <udid>` against a known device name pinned by the CI matrix.
- Android: `emulator -avd <name> -no-window -no-audio` then `adb wait-for-device` then poll `adb shell getprop sys.boot_completed`.
- Both expose the same interface so `run.js` stays platform-agnostic.

### `scripts/maestro.js`

About 50 lines.

- Public function: `runFlow(flowPath, deviceId, junitOut) -> exitCode`.
- Spawns `maestro --device <id> test <flow> --format=junit --output <junitOut>`.
- Streams stdout and stderr to the console; Maestro's own output is human-readable.

### `scripts/check-maestro.js`

About 15 lines.

- Runs `maestro --version`. Exit 0 if present.
- If missing, prints `curl -fsSL https://get.maestro.mobile.dev | bash` and exits non-zero.
- Called from `install:native` so contributors and CI fail fast with a clear remediation.

### `flows/launch.yaml`

About 20 lines, the only test today.

```yaml
appId: com.meteor.smoke
---
- launchApp
- assertVisible: "Meteor ready"
- assertVisible: "DDP connected"
```

These two assertions are only true if the build succeeded, the Cordova wrapper loaded the bundle, the WebView executed JS, Tracker ran, and DDP completed the handshake. One flow exercises the whole stack.

### `apps/smoke/`

Minimal but real Meteor app:

- `Meteor.startup(() => $('#status').text('Meteor ready'))`.
- `Tracker.autorun(() => $('#ddp').text(Meteor.status().connected ? 'DDP connected' : 'DDP connecting'))`.
- `Meteor.publish('ping', function () { this.ready() })` server-side, subscribed from the client, so the connection round-trips.
- `mobile-config.js` sets `App.info({ id: 'com.meteor.smoke', ... })` matching the `appId` in `launch.yaml`.
- `.meteor/platforms` is not committed; `add-platform` is called per run so we never pin a stale Cordova snapshot.

## Data flow

```
$ node tools/native-tests/scripts/run.js --platform=android

 1. resolve LAN IP                       (e.g., 192.168.1.42)
 2. mkdir tmp/native-smoke-android-<runId>/
 3. cp apps/smoke/* -> tmp/
 4. cd tmp && meteor add-platform android
 5. meteor build out/ --server 192.168.1.42:3000 --mobile-server 192.168.1.42:3000
        -> produces out/android/release-unsigned.apk
 6. start server: meteor run --port 192.168.1.42:3000   (background)
        wait-on http://192.168.1.42:3000                (ready gate)
 7. emulator -avd Pixel_API_34 -no-window -no-audio     (background)
        adb wait-for-device
        poll adb shell getprop sys.boot_completed -> 1
 8. adb install -r out/android/release-unsigned.apk
 9. maestro --device emulator-5554 test flows/launch.yaml \
        --format=junit --output junit/android-launch.xml
10. teardown (reverse order, always runs):
        adb uninstall com.meteor.smoke
        emulator -kill
        kill server PID
        rm -rf tmp/
11. exit with maestro's code (0 / 1) or 2 if any infra step threw
```

iOS is identical with `xcrun simctl` instead of `emulator`/`adb`, and `.app` instead of `.apk`. Same orchestrator, two device backends.

## Error handling

Three failure categories with distinct exit codes so CI can react differently:

| Category | Exit | Examples | CI reaction |
|----------|------|----------|-------------|
| Flow failure | 1 | `assertVisible` timeout, app crashes on launch | Block, signal the regression |
| Infrastructure failure | 2 | Simulator did not boot in 5 min, LAN IP unresolvable, Maestro CLI missing | Show as flake, allow retry once |
| Framework bug | 3 | Bad YAML, missing flow file | Block, fix the suite |

Hardening included on day one:

- Every step that allocates a resource (tmpdir, emulator, server) is wrapped in `try/finally`. Cleanup runs on thrown errors and on Ctrl-C. No orphaned emulators in CI.
- 8-minute hard timeout per run.
- Device logs captured unconditionally as artifacts (`adb logcat -d` on Android, `xcrun simctl spawn ... log show` on iOS). Cheap and occasionally invaluable.

Explicitly out of scope on day one:

- Retry-on-flake at the orchestrator level. Maestro already retries within a flow. Wrapping the whole run in a retry loop hides real flakiness. If a flow flakes once a month we live with it; weekly flakes get root-caused.
- Parallel platforms in one process. CI runs two jobs in parallel anyway. Orchestrator stays single-threaded.

## CI integration

`.github/workflows/native.yml`, one file, two jobs, runs nightly against `devel` and on any PR labeled `mobile`.

```yaml
name: Native mobile smoke tests

on:
  schedule:
    - cron: "0 6 * * *"
  pull_request:
    types: [labeled]

concurrency:
  group: native-${{ github.ref }}
  cancel-in-progress: true

jobs:
  android:
    if: github.event_name == 'schedule' || github.event.label.name == 'mobile'
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '17' }
      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666"' \
            | sudo tee /etc/udev/rules.d/99-kvm4all.rules
          sudo udevadm control --reload-rules && sudo udevadm trigger --name-match=kvm
      - name: Install Maestro
        run: curl -fsSL https://get.maestro.mobile.dev | bash
      - run: npm ci
      - run: npm run install:native
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          arch: x86_64
          script: npm run test:native -- --platform=android
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: native-android-${{ github.run_id }}
          path: tools/native-tests/junit/

  ios:
    if: github.event_name == 'schedule' || github.event.label.name == 'mobile'
    runs-on: macos-14
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - name: Install Maestro
        run: curl -fsSL https://get.maestro.mobile.dev | bash
      - run: npm ci
      - run: npm run install:native
      - name: Boot iOS Simulator
        run: |
          xcrun simctl boot "iPhone 15" || true
          xcrun simctl bootstatus "iPhone 15" -b
      - run: npm run test:native -- --platform=ios
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: native-ios-${{ github.run_id }}
          path: tools/native-tests/junit/
```

Notes:

- `reactivecircus/android-emulator-runner@v2` is the de-facto GitHub Actions action for Android emulators. It handles KVM acceleration, AVD cache, and headless boot. Reusing it avoids about 200 lines of hand-rolled emulator shell wrangling. `simulator.js` still drives the device once it is up; the action only provides the runtime.
- iOS uses `macos-14` (arm64) rather than `macos-latest` because `macos-latest` is unstable across GitHub-managed migrations. We pin the major OS version and bump on schedule, not on surprise.
- macOS runner minutes on GitHub Actions cost 10x the Linux multiplier. The nightly-plus-label trigger keeps the spend bounded.

## Developer workflow

```sh
npm run install:native                              # once per checkout
npm run test:native -- --platform=android           # run smoke flow locally
npm run test:native -- --platform=ios               # other platform
```

`--` forwards the platform flag through npm into `run.js`, matching how `npm run test:e2e -- -t="React"` already works in this repo.

Root `package.json` additions:

```json
"install:native": "cd tools/native-tests && npm install && node scripts/check-maestro.js",
"test:native":    "cd tools/native-tests && npm test --"
```

`tools/native-tests/package.json` test script:

```json
"test": "node scripts/run.js"
```

## Future extensions (called out, not built)

These are designed-around but not implemented in v1:

- **HCP flow** (`flows/hot-code-push.yaml`): drops in as a second YAML. `run.js` already iterates `flows/*.yaml`. No structural change.
- **Capacitor wrapper**: `build-app.js` has a `wrapper === 'cordova'` seam. Add a `capacitor` branch when Capacitor lands in core. Flows are wrapper-agnostic because they assert on WebView content.
- **Skeleton matrix**: extend `apps/` with additional directories and have `run.js` accept `--app=<name>`. Today's single `smoke` is `--app=smoke` by default.
- **Real-device farm**: `simulator.js` interface stays the same; a third device backend joins iOS and Android local. Relevant only if local simulator coverage proves insufficient.

## Open questions

None at the time of writing. Update this section if review surfaces concerns.

## Decisions log

| Question | Decision |
|----------|----------|
| Who is the suite for? | Meteor core CI |
| Location | sibling directory `tools/native-tests/` |
| Scope | smoke only (launch, render, DDP connect) |
| Platforms | Android and iOS from day one |
| CI trigger | nightly plus `mobile` label |
| App under test | purpose-built `apps/smoke/`, committed source |
| Wrapper naming | platform-neutral; Capacitor-ready |
| Orchestrator | plain Node CLI, no Jest |
| Directory name | `native-tests` (matches `e2e-tests`, `unit-tests`) |
