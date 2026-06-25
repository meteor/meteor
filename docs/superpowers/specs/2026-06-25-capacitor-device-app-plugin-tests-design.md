# Capacitor Device and App Plugin Test Design

Date: 2026-06-25
Status: Approved for implementation planning

## Goal

Extend Meteor's native and web test coverage so Capacitor plugin imports,
configuration, native sync, runtime calls, and rendered output are verified for
official Capacitor app-context plugins.

The test plugins are:

- `@capacitor/device@^7.0.5`
- `@capacitor/app@^7.1.2`

These stay on the Capacitor 7 line used by Meteor's current Capacitor tooling.

## Existing Context

`tools/native-tests/apps/capacitor-tests` is the default native test fixture.
It is installed, platform-added, synced, built, launched in an iOS Simulator or
Android emulator, and asserted through Maestro visible text. This is the right
place to prove native plugin registration and native WebView behavior.

`tools/e2e-tests/apps/native-react` already covers the Capacitor web lifecycle
with native run skipped. It is the right place to prove browser-side imports and
web plugin behavior without simulator cost.

## Runtime Responsibilities

Native tests own native behavior:

- package dependencies are installed before `meteor add-platform`
- `npx cap sync` sees both plugins
- native build succeeds with the plugins linked
- `Device.getInfo()` resolves through native implementation
- `App.getInfo()` resolves through native implementation
- rendered text exposes stable values for Maestro

E2E tests own web behavior:

- Rspack/Meteor client build can bundle both plugin imports
- `Device.getInfo()` resolves with `platform: "web"`
- `App.getInfo()` rejects on web with Capacitor's "Not implemented on web."
  behavior
- rendered text exposes stable values for Playwright assertions

## Native Fixture Changes

Update `tools/native-tests/apps/capacitor-tests/package.json` with
`@capacitor/device` and `@capacitor/app` dependencies.

Update `client/main.html` with visible status nodes:

- `device-plugin-status`
- `device-plugin-platform-status`
- `app-plugin-status`

Update `client/main.js` to import:

```js
import { Device } from "@capacitor/device";
import { App as CapacitorApp } from "@capacitor/app";
```

At startup, call both plugins asynchronously. Stable rendered strings:

- `Device plugin ready: native`
- `Device plugin platform: android` or `Device plugin platform: ios`
- `App plugin ready: com.meteor.capacitortests`

On failure, render explicit error strings. Maestro should assert the success
strings so native plugin regressions fail visibly.

## Native Maestro Changes

Add assertions to all native Capacitor flows that launch the runtime app:

- `flows/capacitor-tests.yaml`
- `flows/capacitor-tests-livereload-initial.yaml`
- `flows/capacitor-tests-livereload.yaml`
- `flows/capacitor-tests-hcp-initial.yaml`
- `flows/capacitor-tests-hcp.yaml`

Assertions:

- `Device plugin ready: native`
- `App plugin ready: com.meteor.capacitortests`

The app code must render `Device plugin ready: native` only after validating
that `Device.getInfo().platform` is `android` or `ios`. This keeps shared
Maestro flows platform-neutral without weakening the native assertion.

## E2E Fixture Changes

Update `tools/e2e-tests/apps/native-react/package.json` with the same plugin
dependencies.

Update `imports/ui/App.jsx` to import and call both plugins. Render stable
test ids:

- `native-device-plugin`
- `native-app-plugin`

Stable rendered strings:

- `Device plugin ready: web`
- `App plugin unavailable on web`

The app plugin line must be produced only after catching the expected
`Not implemented on web.` error from `App.getInfo()`.

## E2E Test Changes

Update `assertNativeReactApp()` in `tools/e2e-tests/capacitor.test.js` to assert
both visible plugin lines after the app root renders.

Also assert no browser console errors or page errors continue to occur. The
expected `App.getInfo()` web rejection must be caught by app code and must not
surface as an unhandled page error.

## Coverage Documentation

Update `dev/modern-tools/rspack/E2E_COVERAGE.md` because the `native-react`
fixture gains new npm compatibility coverage and new custom assertions.

Add:

- native-react app row for Capacitor Device/App web plugin behavior
- npm package compatibility entries for `@capacitor/device` and
  `@capacitor/app`
- feature matrix row for Capacitor official plugin import/runtime behavior

## Error Handling

Plugin checks should be isolated from the existing render, CSS, DDP, HCP, and
path adaptation checks. A plugin failure should update only plugin-specific
status text, then let the rest of the test app continue rendering. This keeps
Maestro and Playwright failures specific.

No test should assert volatile values such as OS version, device model, memory
usage, app version, or build number. The stable contract is successful native
plugin resolution plus platform/app id.

## Verification

Fast verification:

- `cd tools/native-tests && npm test -- --runInBand`
- `npm run test:e2e -- capacitor.test.js -t "meteor run android"`

Native verification when simulator/emulator prerequisites exist:

- `npm run test:native:capacitor:android`
- `npm run test:native:capacitor:ios`
