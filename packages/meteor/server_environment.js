meteorEnv = {
  NODE_ENV: process.env.NODE_ENV || "production",
  TEST_METADATA: process.env.TEST_METADATA || "{}",
};

const config =
  typeof __meteor_runtime_config__ === "object" && __meteor_runtime_config__;

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
  isModern: true,
};

Meteor.settings = {};

if (process.env.METEOR_SETTINGS) {
  try {
    Meteor.settings = JSON.parse(process.env.METEOR_SETTINGS);
  } catch (e) {
    throw new Error("METEOR_SETTINGS are not valid JSON.");
  }
}

// Apply individual METEOR_SETTINGS_<PATH> environment variable overrides.
//
// Each env var with the prefix METEOR_SETTINGS_ maps to a dot-separated path
// inside Meteor.settings, derived by lowercasing the suffix and treating each
// underscore as a path separator.
//
// Examples:
//   METEOR_SETTINGS_PUBLIC_THEME=dark  →  Meteor.settings.public.theme = "dark"
//   METEOR_SETTINGS_APIURL=http://...  →  Meteor.settings.apiurl = "http://..."
//
// Values are JSON-parsed when possible; bare strings are kept as strings.
//
// Note: flat setting keys that contain underscores cannot be individually
// targeted via this mechanism — a key like "my_setting" would be interpreted
// as a nested path { my: { setting: ... } }.
(function applyEnvSettingsOverrides() {
  var prefix = "METEOR_SETTINGS_";

  function deepSet(obj, pathParts, value) {
    var current = obj;
    for (var i = 0; i < pathParts.length - 1; i++) {
      var segment = pathParts[i];
      if (
        current[segment] === null ||
        typeof current[segment] !== "object" ||
        Array.isArray(current[segment])
      ) {
        current[segment] = {};
      }
      current = current[segment];
    }
    current[pathParts[pathParts.length - 1]] = value;
  }

  Object.keys(process.env).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) {
      return;
    }
    var suffix = key.slice(prefix.length);
    if (!suffix) {
      return;
    }
    var pathParts = suffix.toLowerCase().split("_").filter(Boolean);
    var raw = process.env[key];
    var value;
    try {
      value = JSON.parse(raw);
    } catch (e) {
      value = raw;
    }
    deepSet(Meteor.settings, pathParts, value);
  });
})();

// Make sure that there is always a public attribute
// to enable Meteor.settings.public on client
if (!Meteor.settings.public) {
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
