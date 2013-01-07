Meteor = {
  isClient: false,
  isServer: true
};

try {
  Meteor.settings = {};
  if (process.env.METEOR_SETTINGS)
    Meteor.settings = JSON.parse(process.env.METEOR_SETTINGS);
} catch (e) {
  throw new Error("Settings are not valid JSON");
}

