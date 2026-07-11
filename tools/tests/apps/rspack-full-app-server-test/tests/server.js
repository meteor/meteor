// Server test module, loaded only when meteor.testModule.server points here.
// It defines no framework tests on purpose — it just prints a deterministic
// marker so a self-test can confirm, via `run.match()`, that the configured
// server test module was actually loaded in full-app mode (alongside the app's
// own main server module). Using a bare console.log keeps the fixture free of
// any test-driver dependency.
console.log(`RSPACK_TEST_SERVER_MARKER CONFIG_TEST_SERVER=${process.env.METEOR_CONFIG_TEST_SERVER || ''}`);
