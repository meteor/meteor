const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("fs-extra");

const {
  configureLocalMeteorWebappPlugin,
} = require("./cordova-plugin-override");

test("replaces registry plugin entry with encoded local checkout URL", async (t) => {
  const appDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "cordova-plugin-override-test-")
  );
  t.after(() => fs.remove(appDir));
  const pluginDir = path.join(appDir, "plugin checkout #100%");

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
    pluginDir,
  });

  const entries = (await fs.readFile(pluginsFile, "utf8"))
    .trim()
    .split("\n");
  assert.deepEqual(entries.slice(0, 1), ["cordova-plugin-device@2.1.0"]);
  assert.equal(
    entries[1],
    `cordova-plugin-meteor-webapp@${pathToFileURL(pluginDir).href}`
  );
});
