const execa = require("execa");
const path = require("node:path");
const fs = require("fs-extra");

const ANDROID_TRANSIENT_DRIVER_FAILURE_PATTERNS = [
  /StatusRuntimeException:\s+UNAVAILABLE/i,
  /Command failed \(tcp:7101\): closed/i,
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientAndroidDriverFailure(report = "") {
  return ANDROID_TRANSIENT_DRIVER_FAILURE_PATTERNS.some((pattern) => pattern.test(report));
}

async function readJUnitReport(junitOut) {
  try {
    return await fs.readFile(junitOut, "utf8");
  } catch {
    return "";
  }
}

/**
 * Run a single Maestro flow against a device.
 *
 * @param {object} opts
 * @param {string} opts.flowPath  Absolute path to a .yaml flow file.
 * @param {string} opts.deviceId  Device identifier (UDID for iOS, "emulator-5554" for Android).
 * @param {string} opts.junitOut  Absolute path where JUnit XML will be written.
 * @param {string} [opts.platform] Platform name.
 * @param {number} [opts.retries] Number of retries for transient infra failures.
 * @returns {Promise<{exitCode: number}>}
 */
async function runFlow({
  flowPath,
  deviceId,
  junitOut,
  platform,
  retries = 0,
}) {
  await fs.ensureDir(path.dirname(junitOut));

  for (let attempt = 0; attempt <= retries; attempt += 1) {
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

    if (result.exitCode === 0) {
      return { exitCode: 0 };
    }

    if (platform !== "android" || attempt >= retries) {
      return { exitCode: result.exitCode };
    }

    const report = await readJUnitReport(junitOut);
    if (!isTransientAndroidDriverFailure(report)) {
      return { exitCode: result.exitCode };
    }

    console.warn(
      `Maestro Android driver disconnected while running ${path.basename(flowPath)}. Retrying once.`
    );
    await sleep(2000);
  }

  return { exitCode: 1 };
}

module.exports = {
  isTransientAndroidDriverFailure,
  runFlow,
};
