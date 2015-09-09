Meteor = {
  isClient: false,
  isServer: true,
  isCordova: false
};

Meteor.settings = {};

if (process.env.METEOR_SETTINGS) {
  try {
    Meteor.settings = JSON.parse(process.env.METEOR_SETTINGS);
  } catch (e) {
    throw new Error("METEOR_SETTINGS are not valid JSON: " + process.env.METEOR_SETTINGS);
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
if (typeof __meteor_runtime_config__ === "object") {
  __meteor_runtime_config__.PUBLIC_SETTINGS = Meteor.settings.public;
}
