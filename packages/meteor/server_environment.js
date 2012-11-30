Meteor = {
  isClient: false,
  isServer: true
};

try {
  Meteor.settings = JSON.parse(process.env.METEOR_SETTINGS);
} catch (e) {
  // If the settings aren't JSON, just treat them as a string, or
  // undefined, or whatever they are.
  Meteor.settings = process.env.METEOR_SETTINGS;
}

