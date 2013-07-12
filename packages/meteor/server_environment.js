// @export Meteor
Meteor = {
  isClient: false,
  isServer: true
};

Meteor.settings = {};
if (process.env.METEOR_SETTINGS) {
  try {
    Meteor.settings = JSON.parse(process.env.METEOR_SETTINGS);
  } catch (e) {
    throw new Error("Settings are not valid JSON");
  }
}
// Push a subset of settings to the client.
if (Meteor.settings && Meteor.settings.public &&
    typeof __meteor_runtime_config__ === "object") {
  __meteor_runtime_config__.PUBLIC_SETTINGS = Meteor.settings.public;
}
