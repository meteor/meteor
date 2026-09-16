const execa = require("execa");

const BOOT_TIMEOUT_MS = 300_000;
const APP_ID = "com.meteor.smoke";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootIos() {
  const deviceName = process.env.MAESTRO_IOS_DEVICE || "iPhone 15";

  await execa("xcrun", ["simctl", "boot", deviceName], { reject: false });
  await execa("xcrun", ["simctl", "bootstatus", deviceName, "-b"]);

  const { stdout } = await execa("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
  const data = JSON.parse(stdout);
  let udid = null;
  for (const list of Object.values(data.devices)) {
    for (const dev of list) {
      if (dev.name === deviceName && dev.state === "Booted") {
        udid = dev.udid;
        break;
      }
    }
    if (udid) break;
  }
  if (!udid) {
    throw new Error(`Could not resolve UDID for booted iOS device "${deviceName}"`);
  }

  return {
    platform: "ios",
    deviceId: udid,
    async install(bundlePath) {
      await execa("xcrun", ["simctl", "install", udid, bundlePath]);
    },
    async uninstall() {
      await execa("xcrun", ["simctl", "uninstall", udid, APP_ID], { reject: false });
    },
    async captureLogs(outPath) {
      const { stdout } = await execa(
        "xcrun",
        ["simctl", "spawn", udid, "log", "show", "--last", "5m", "--style", "compact"],
        { reject: false }
      );
      const fs = require("fs-extra");
      await fs.outputFile(outPath, stdout);
    },
    async shutdown() {
      await execa("xcrun", ["simctl", "shutdown", udid], { reject: false });
    },
  };
}

async function bootAndroid() {
  // On CI, reactivecircus/android-emulator-runner@v2 brings the emulator up
  // before our script runs. Locally, the caller must have run `emulator -avd <name>`
  // beforehand. Either way, `adb wait-for-device` is the right ready gate.
  await execa("adb", ["wait-for-device"]);

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let booted = false;
  while (Date.now() < deadline) {
    const { stdout } = await execa(
      "adb",
      ["shell", "getprop", "sys.boot_completed"],
      { reject: false }
    );
    if (stdout.trim() === "1") {
      booted = true;
      break;
    }
    await sleep(2000);
  }
  if (!booted) {
    throw new Error("Android emulator did not reach sys.boot_completed=1 in 5 min");
  }

  const { stdout: devices } = await execa("adb", ["devices"]);
  const match = devices.split("\n").find((l) => /^emulator-\d+\s+device$/.test(l));
  if (!match) {
    throw new Error("No booted Android emulator visible to adb");
  }
  const deviceId = match.split(/\s+/)[0];

  return {
    platform: "android",
    deviceId,
    async install(bundlePath) {
      await execa("adb", ["-s", deviceId, "install", "-r", bundlePath]);
    },
    async uninstall() {
      await execa("adb", ["-s", deviceId, "uninstall", APP_ID], { reject: false });
    },
    async captureLogs(outPath) {
      const { stdout } = await execa(
        "adb",
        ["-s", deviceId, "logcat", "-d"],
        { reject: false }
      );
      const fs = require("fs-extra");
      await fs.outputFile(outPath, stdout);
    },
    async shutdown() {
      // On CI the emulator-runner action handles shutdown. Locally we leave
      // the user's emulator running for fast iteration; uninstall covers cleanup.
    },
  };
}

async function bootSimulator(platform) {
  if (platform === "ios") return bootIos();
  if (platform === "android") return bootAndroid();
  throw new Error(`Unsupported platform: ${platform}`);
}

module.exports = { bootSimulator };
