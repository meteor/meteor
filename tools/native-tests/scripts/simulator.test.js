const test = require("node:test");
const assert = require("node:assert/strict");
const { waitForAndroidDevice } = require("./simulator");

test("waitForAndroidDevice fails clearly when adb wait times out", async () => {
  await assert.rejects(
    () => waitForAndroidDevice(async () => ({ timedOut: true })),
    /No Android emulator became visible to adb/
  );
});

test("waitForAndroidDevice fails clearly when adb exits non-zero", async () => {
  await assert.rejects(
    () => waitForAndroidDevice(async () => ({ exitCode: 1 })),
    /adb wait-for-device failed with exit code 1/
  );
});

test("waitForAndroidDevice accepts a successful adb wait", async () => {
  await waitForAndroidDevice(async () => ({ exitCode: 0 }));
});
