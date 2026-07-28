const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("fs-extra");

const {
  configureLocalMeteorWebappPlugin,
} = require("./cordova-plugin-override");

test("replaces registry plugin entry with local checkout path", async (t) => {
  const appDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "cordova-plugin-override-test-")
  );
  t.after(() => fs.remove(appDir));

  const pluginsFile = path.join(appDir, ".meteor", "cordova-plugins");
  await fs.outputFile(
    pluginsFile,
    [
      "cordova-plugin-device@2.1.0",
      "cordova-plugin-meteor-webapp@2.0.4",
      "",
    ].join("\n"),
    "utf8"
  );

  await configureLocalMeteorWebappPlugin({
    appDir,
    pluginDir: "/checkout/npm-packages/cordova-plugin-meteor-webapp",
  });

  assert.equal(
    await fs.readFile(pluginsFile, "utf8"),
    [
      "cordova-plugin-device@2.1.0",
      "cordova-plugin-meteor-webapp@file:///checkout/npm-packages/cordova-plugin-meteor-webapp",
      "",
    ].join("\n")
  );
});
