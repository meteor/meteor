Meteor = {
  isClient: true,
  isServer: false
};

if (typeof __meteor_runtime_config__ === 'object' &&
    __meteor_runtime_config__.PUBLIC_SETTINGS) {
  Meteor.settings = { 'public': __meteor_runtime_config__.PUBLIC_SETTINGS };
}
