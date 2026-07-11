var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

const APP_TEMPLATE = 'rspack-full-app';

// Markers planted by the fixture's client/main.js and server/main.js. A real
// compiled bundle contains its marker; the placeholder the plugin regenerates
// for a not-built side does not. So "bundle still contains the marker" is what
// distinguishes a surviving build from one that was wiped and re-stubbed.
//
// We check the side that is actually written to disk in each mode: `meteor
// test` writes the client bundle to _build/test/client-rspack.js, while a dev
// server serves the client over HMR and only writes the real bundle for the
// server side (its _build/main-dev/client-rspack.js stays a small stub).
const CLIENT_MARKER = 'RSPACK_CLIENT_APP_MARKER';
const SERVER_MARKER = 'RSPACK_SERVER_APP_MARKER';

function bundleHasMarker(s, relPath, marker) {
  const bundle = s.read(relPath);
  return bundle != null && bundle.includes(marker);
}

// Developers commonly keep `meteor run` alive in one terminal while running
// `meteor test` in another, on the same app directory. On startup the rspack
// plugin used to wipe the OTHER mode's live build output two ways, so whichever
// instance started second broke the one already running (it served blank/broken
// bundles until it happened to rebuild):
//   1. cleanBuildContextFiles() deleted every mode's `_build/*` module dirs.
//   2. ensureModuleFilesExist() overwrote every mode's `*-rspack.js` output
//      bundle with the empty placeholder scaffold.
// These tests pin down the fixed contract: starting one mode leaves the other
// mode's already-compiled bundle intact.
//
// The check is on bundle *content*, not mere existence: the plugin always
// regenerates a placeholder `*-rspack.js` for every mode on startup, so a
// clobbered bundle still EXISTS as an empty stub — an existence check would
// pass even when the real build was destroyed. Only the app-code marker proves
// the real compiled bundle survived.

selftest.define(
  'rspack: meteor run preserves test-mode build artifacts',
  ['checkout'],
  async function () {
    // Scenario: a `meteor test --full-app` instance has compiled its client
    // bundle, then a `meteor run` dev server starts on the same directory.
    // Without the fix, the dev server's startup wiped _build/test back to a
    // placeholder, so the still-running test instance served no client code.
    const s = new Sandbox();
    await s.init();

    await s.createApp('app', APP_TEMPLATE);
    s.cd('app');

    // Produce a real full-app test-mode client bundle first. (In test mode the
    // client bundle IS written to disk, so its marker is the reliable signal.)
    const testRun = s.run(
      'test',
      '--full-app',
      '--driver-package', 'test-in-console',
      '--port', '24720'
    );
    testRun.waitSecs(300);
    await testRun.match('RSPACK_SERVER_APP_MARKER');
    await testRun.match('App running at');
    await testRun.stop();

    if (!bundleHasMarker(s, '_build/test/client-rspack.js', CLIENT_MARKER)) {
      selftest.fail('Expected _build/test/client-rspack.js to contain the app client code after `meteor test --full-app`');
    }

    // Now start a dev server on the same app directory.
    const devRun = s.run('--port', '24721');
    devRun.waitSecs(300);
    await devRun.match('App running at');
    await devRun.stop();

    // The dev instance must clean only its own (main-*) mode; the compiled
    // test-mode bundle must survive its startup rather than be wiped back to a
    // placeholder.
    if (!bundleHasMarker(s, '_build/test/client-rspack.js', CLIENT_MARKER)) {
      selftest.fail('`meteor run` clobbered _build/test/client-rspack.js — a concurrent test instance would serve a blank bundle');
    }
  }
);

selftest.define(
  'rspack: meteor test preserves dev/prod build artifacts',
  ['checkout'],
  async function () {
    // Scenario: the reverse of the previous test. A `meteor run` dev server has
    // compiled its server bundle, then `meteor test --full-app` starts on the
    // same directory. Without the fix, the test instance's startup wiped
    // _build/main-dev back to a placeholder, breaking the running dev server.
    //
    // Here we check the SERVER bundle: a dev server serves the client over HMR,
    // so _build/main-dev/client-rspack.js stays a stub — the server bundle is
    // the only side with real app code on disk in dev mode.
    const s = new Sandbox();
    await s.init();

    await s.createApp('app', APP_TEMPLATE);
    s.cd('app');

    // Produce a real dev-mode server bundle first.
    const devRun = s.run('--port', '24730');
    devRun.waitSecs(300);
    await devRun.match('App running at');
    await devRun.stop();

    if (!bundleHasMarker(s, '_build/main-dev/server-rspack.js', SERVER_MARKER)) {
      selftest.fail('Expected _build/main-dev/server-rspack.js to contain the app server code after `meteor run`');
    }

    // Now start a test-mode instance on the same app directory.
    const testRun = s.run(
      'test',
      '--full-app',
      '--driver-package', 'test-in-console',
      '--port', '24731'
    );
    testRun.waitSecs(300);
    await testRun.match('App running at');
    await testRun.stop();

    // The test instance must clean only test-mode artifacts; the compiled dev
    // bundle must survive its startup.
    if (!bundleHasMarker(s, '_build/main-dev/server-rspack.js', SERVER_MARKER)) {
      selftest.fail('`meteor test` clobbered _build/main-dev/server-rspack.js — a concurrent dev server would serve a blank bundle');
    }
  }
);
