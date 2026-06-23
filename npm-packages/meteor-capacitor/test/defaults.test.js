const test = require("node:test");
const assert = require("node:assert/strict");
const { defineConfig } = require("..");

const ENV_KEYS = [
  "METEOR_CAPACITOR_MODE",
  "METEOR_CAPACITOR_LIVERELOAD",
  "METEOR_CAPACITOR_LOCAL_IP",
  "METEOR_CAPACITOR_WEB_DIR",
  "METEOR_BUILD_CONTEXT",
  "METEOR_BUILD",
  "METEOR_RUN",
  "METEOR_NATIVE_ANDROID",
  "METEOR_NATIVE_IOS",
  "ROOT_URL",
  "PORT",
  "NODE_ENV",
];

function withEnv(env, fn) {
  const previous = {};
  for (const key of ENV_KEYS) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function minimalConfig() {
  return defineConfig({
    appId: "com.example.app",
    appName: "Example",
  });
}

test("standalone Meteor run context defaults to bundled mode", () => {
  const config = withEnv({
    METEOR_CAPACITOR_LOCAL_IP: "10.0.0.5",
    PORT: "3210",
  }, minimalConfig);

  assert.equal(config.server.url, undefined);
  assert.equal(config.server.cleartext, undefined);
  assert.equal(config.server.androidScheme, "http");
});

test("livereload mode defaults server.url to ROOT_URL", () => {
  const config = withEnv({
    METEOR_CAPACITOR_MODE: "livereload",
    ROOT_URL: "https://staging.example.com",
    PORT: "3210",
  }, minimalConfig);

  assert.equal(config.server.url, "https://staging.example.com/__cordova/");
  assert.equal(config.server.cleartext, undefined);
  assert.equal(config.server.androidScheme, "http");
});

test("livereload mode falls back to local Meteor URL when ROOT_URL is absent", () => {
  const config = withEnv({
    METEOR_CAPACITOR_MODE: "livereload",
    METEOR_CAPACITOR_LOCAL_IP: "10.0.0.6",
    PORT: "3211",
  }, minimalConfig);

  assert.equal(config.server.url, "http://10.0.0.6:3211/__cordova/");
  assert.equal(config.server.cleartext, true);
  assert.equal(config.server.androidScheme, "http");
});

test("bundled mode omits server.url by default", () => {
  const config = withEnv({
    METEOR_CAPACITOR_MODE: "bundled",
  }, minimalConfig);

  assert.equal(config.server.url, undefined);
  assert.equal(config.server.androidScheme, "http");
  assert.equal(config.server.cleartext, undefined);
});

test("bundled run mode enables Android cleartext for Meteor DDP", () => {
  const config = withEnv({
    METEOR_CAPACITOR_MODE: "bundled",
    METEOR_RUN: "true",
  }, minimalConfig);

  assert.equal(config.server.url, undefined);
  assert.equal(config.server.androidScheme, "http");
  assert.equal(config.server.cleartext, true);
});
