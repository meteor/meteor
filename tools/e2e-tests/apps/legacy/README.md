# Legacy

Minimal app for the Rspack legacy flow introduced in Meteor 3.6 (issue #14756). Modern, legacy, and Cordova entries all use Rspack. The legacy entry requires an alias enabled only when `Meteor.isLegacy` is true and a custom loader; a DefinePlugin constant and dynamic import verify that it uses its own compilation and chunks. Imported CSS and an emitted SVG check its separate styles and asset URLs. The integration targets ES5 for the legacy SWC transform and Rspack runtime.

To run against both parts of this checkout, start from the repository root:

```sh
node tools/e2e-tests/scripts/link-rspack.js tools/e2e-tests/apps/legacy
cd tools/e2e-tests/apps/legacy
../../../../meteor run
```

Add `--production` to inspect production mode. This fixture sets `modern.webArchOnly: false` so development also builds the legacy browser program. Open `http://localhost:3000/` normally for modern. To select legacy, override the user agent in your browser's developer tools and reload the same URL:

```text
Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko
```

`legacy.test.js` runs the shared E2E lifecycle: development and production runs with client/server rebuilds, watched app tests, tests once, a deployed production bundle, and reset. Browser assertions select both modern and legacy programs; the legacy test module also runs through its own Rspack compilation and rebuilds.

`regressions/architecture-entrypoints.test.js` keeps the focused production/debug build, explicit `false`, omitted-entry, and ES5 assertions. It also verifies full-app tests with both browser programs, legacy development reloads, and excluded architectures. An Android platform is added only to its temporary copy to inspect the Cordova web program without a native SDK.

Run both suites sequentially from the repository root:

```sh
npm run test:e2e:group -- other --runTestsByPath legacy.test.js
npm run test:e2e:group -- regressions --runTestsByPath regressions/architecture-entrypoints.test.js
```

Acorn validates syntax; it does not compile the code. Browser checks use Chromium with normal and legacy user agents, so they verify delivery and execution rather than emulate an old browser engine or guarantee compatibility of every dependency.
