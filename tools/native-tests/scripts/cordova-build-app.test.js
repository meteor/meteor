const test = require("node:test");
const assert = require("node:assert/strict");

const { buildIosSimulatorArgs } = require("./build-app");

test("builds Cordova iOS 8 simulator app with fixed App scheme", () => {
  assert.deepEqual(
    buildIosSimulatorArgs({
      workspace: "/tmp/project/App.xcworkspace",
      derivedData: "/tmp/build/derived-data",
    }),
    [
      "-workspace",
      "/tmp/project/App.xcworkspace",
      "-scheme",
      "App",
      "-configuration",
      "Debug",
      "-sdk",
      "iphonesimulator",
      "-destination",
      "generic/platform=iOS Simulator",
      "-derivedDataPath",
      "/tmp/build/derived-data",
      "build",
    ]
  );
});
