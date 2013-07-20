// @export Meteor.isClient
Meteor.isClient = true;

// @export Meteor.isServer
Meteor.isServer = false;

// @export Meteor.settings
if (typeof __meteor_runtime_config__ === 'object' &&
    __meteor_runtime_config__.PUBLIC_SETTINGS) {
  Meteor.settings = { public: __meteor_runtime_config__.PUBLIC_SETTINGS };
}
