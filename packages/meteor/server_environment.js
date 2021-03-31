meteorEnv = {
  NODE_ENV: process.env.NODE_ENV || "production",
  TEST_METADATA: process.env.TEST_METADATA || "{}"
};

const config = typeof __meteor_runtime_config__ === "object" &&
  __meteor_runtime_config__;

if (config) {
  config.meteorEnv = meteorEnv;
}

Meteor = {
  isProduction: meteorEnv.NODE_ENV === "production",
  isDevelopment: meteorEnv.NODE_ENV !== "production",
  isClient: false,
  isServer: true,
  isCordova: false,
  // Server code runs in Node 8+, which is decidedly "modern" by any
  // reasonable definition.
  isModern: true
};

Meteor.settings = {};

if (process.env.METEOR_SETTINGS) {
  try {
    Meteor.settings = JSON.parse(process.env.METEOR_SETTINGS);
  } catch (e) {
    throw new Error("METEOR_SETTINGS are not valid JSON.");
  }
}

// Make sure that there is always a public attribute
// to enable Meteor.settings.public on client
if (! Meteor.settings.public) {
    Meteor.settings.public = {};
}

// Push a subset of settings to the client.  Note that the way this
// code is written, if the app mutates `Meteor.settings.public` on the
// server, it also mutates
// `__meteor_runtime_config__.PUBLIC_SETTINGS`, and the modified
// settings will be sent to the client.
if (config) {
  config.PUBLIC_SETTINGS = Meteor.settings.public;
}

if (config && config.gitCommitHash) {
  Meteor.gitCommitHash = config.gitCommitHash;
}
