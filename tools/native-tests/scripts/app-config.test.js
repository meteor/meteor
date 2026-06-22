const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_APP,
  getAppConfig,
  listAppNames,
} = require("./app-config");

test("defaults to the capacitor-tests app", () => {
  assert.equal(DEFAULT_APP, "capacitor-tests");

  const app = getAppConfig();
  assert.equal(app.name, "capacitor-tests");
  assert.equal(app.appId, "com.meteor.capacitortests");
  assert.equal(app.wrapper, "capacitor");
  assert.match(app.sourceDir, /tools\/native-tests\/apps\/capacitor-tests$/);
  assert.match(app.flowPath, /tools\/native-tests\/flows\/capacitor-tests\.yaml$/);
  assert.match(app.livereloadInitialFlowPath, /tools\/native-tests\/flows\/capacitor-tests-livereload-initial\.yaml$/);
  assert.match(app.livereloadFlowPath, /tools\/native-tests\/flows\/capacitor-tests-livereload\.yaml$/);
});

test("keeps smoke app available as Cordova fallback", () => {
  const app = getAppConfig("smoke");
  assert.equal(app.name, "smoke");
  assert.equal(app.appId, "com.meteor.smoke");
  assert.equal(app.wrapper, "cordova");
  assert.match(app.sourceDir, /tools\/native-tests\/apps\/smoke$/);
  assert.match(app.flowPath, /tools\/native-tests\/flows\/launch\.yaml$/);
});

test("lists available app names", () => {
  assert.deepEqual(listAppNames(), ["capacitor-tests", "smoke"]);
});

test("throws on unknown app name", () => {
  assert.throws(() => getAppConfig("missing"), /Unknown native test app: missing/);
});
