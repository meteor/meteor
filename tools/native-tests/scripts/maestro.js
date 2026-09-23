const execa = require("execa");
const path = require("node:path");
const fs = require("fs-extra");

/**
 * Run a single Maestro flow against a device.
 *
 * @param {object} opts
 * @param {string} opts.flowPath  Absolute path to a .yaml flow file.
 * @param {string} opts.deviceId  Device identifier (UDID for iOS, "emulator-5554" for Android).
 * @param {string} opts.junitOut  Absolute path where JUnit XML will be written.
 * @returns {Promise<{exitCode: number}>}
 */
async function runFlow({ flowPath, deviceId, junitOut }) {
  await fs.ensureDir(path.dirname(junitOut));

  const result = await execa(
    "maestro",
    [
      "--device", deviceId,
      "test", flowPath,
      "--format", "junit",
      "--output", junitOut,
    ],
    { reject: false, stdio: "inherit" }
  );

  return { exitCode: result.exitCode };
}

module.exports = { runFlow };
