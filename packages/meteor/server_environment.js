Meteor = {
  isClient: false,
  isServer: true
};

Meteor.settings = {};

if (process.env.APP_CONFIG) {
  // put settings from the app configuration in the settings.  Don't depend on
  // the Galaxy package for now, to avoid silly loops.
 try {
   var appConfig = JSON.parse(process.env.APP_CONFIG);
   if (!appConfig.settings) {
     Meteor.settings = {};
   } else if (typeof appConfig.settings === "string") {
     Meteor.settings = JSON.parse(appConfig.settings);
   } else {
     // Old versions of Galaxy may store settings in MongoDB as objects. Newer
     // versions store it as strings (so that we aren't restricted to
     // MongoDB-compatible objects). This line makes it work on older Galaxies.
     // XXX delete this eventually
     Meteor.settings = appConfig.settings;
   }
  } catch (e) {
    throw new Error("Settings from app config are not valid JSON");
  }
} else if (process.env.METEOR_SETTINGS) {
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
