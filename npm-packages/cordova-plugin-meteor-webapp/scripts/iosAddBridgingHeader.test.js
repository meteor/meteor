const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const addBridgingHeader = require("./iosAddBridgingHeader");

test("uses the cordova-ios project location for the app bridging header", async (t) => {
  const projectRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "cordova-ios-hook-test-")
  );
  t.after(() => fsp.rm(projectRoot, { recursive: true, force: true }));

  const platformRoot = path.join(projectRoot, "platforms", "ios");
  const appRoot = path.join(platformRoot, "App");
  const bridgingHeader = path.join(appRoot, "Bridging-Header.h");
  await fsp.mkdir(appRoot, { recursive: true });
  await fsp.writeFile(bridgingHeader, "#import <Cordova/CDV.h>\n", "utf8");
  const cordovaIosModule = path.join(
    projectRoot,
    "node_modules",
    "cordova-ios",
    "index.js"
  );
  await fsp.mkdir(path.dirname(cordovaIosModule), { recursive: true });
  await fsp.writeFile(
    cordovaIosModule,
    [
      'const path = require("node:path");',
      "module.exports = class CordovaIos {",
      "  constructor(platform, root) {",
      '    if (platform !== "ios") throw new Error("Expected iOS platform");',
      '    this.locations = { xcodeCordovaProj: path.join(root, "App") };',
      "  }",
      "};",
      "",
    ].join("\n"),
    "utf8"
  );

  const context = {
    opts: {
      projectRoot,
      plugin: { id: "cordova-plugin-meteor-webapp" },
    },
    requireCordovaModule(moduleName) {
      if (moduleName === "cordova-lib/src/cordova/util.js") {
        return { projectConfig: () => path.join(projectRoot, "config.xml") };
      }
      if (moduleName === "cordova-common") {
        return {
          ConfigParser: class {
            name() {
              return "MeteorSmoke";
            }
          },
        };
      }
      throw new Error(`Unexpected module: ${moduleName}`);
    },
  };

  addBridgingHeader(context);
  addBridgingHeader(context);

  const content = fs.readFileSync(bridgingHeader, "utf8");
  assert.equal(
    content.match(
      /#import "cordova-plugin-meteor-webapp-Bridging-Header\.h"/g
    )?.length,
    1
  );
});
