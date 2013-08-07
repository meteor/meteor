var Future = Npm.require("fibers/future");

Galaxy = {};


Galaxy.findGalaxy = _.once(function () {
  if (!('GALAXY' in process.env || 'ULTRAWORLD_DDP_ENDPOINT' in process.env)) {
    return null;
  }

  return DDP.connect(process.env.GALAXY || process.env.ULTRAWORLD_DDP_ENDPOINT);
});


// TODO: Eventually, keep track of the replica set, and generally be conected to the
// leader.  Waiting on actually having that concept implemented in ultraworld.
var ultra = Galaxy.findGalaxy();

var subFuture = new Future();
if (ultra)
  ultra.subscribe("oneApp", process.env.GALAXY_APP, subFuture.resolver());

var OneAppApps;
var Services;
var collectionFuture = new Future();

Meteor.startup(function () {
  if (ultra) {
    OneAppApps = new Meteor.Collection("apps", {
      connection: ultra
    });
    Services = new Meteor.Collection('services', {
      manager: ultra
    });
    collectionFuture.return();
  }
});


var staticAppConfig;

try {
  if (process.env.APP_CONFIG) {
    staticAppConfig = JSON.parse(process.env.APP_CONFIG);
  } else {
    var settings;
    try {
      if (process.env.METEOR_SETTINGS) {
        settings = JSON.parse(process.env.METEOR_SETTINGS);
      }
    } catch (e) {
      Log.warn("Could not parse METEOR_SETTINGS as JSON");
    }
    staticAppConfig = {
      settings: settings,
      packages: {
        'mongo-livedata': {
          url: process.env.MONGO_URL
        },
        'email': {
          url: process.env.MAIL_URL
        }
      }
    };
  }
} catch (e) {
  Log.warn("Could not parse initial APP_CONFIG environment variable");
};

Galaxy.getAppConfig = function () {
  if (!subFuture.isResolved() && staticAppConfig)
    return staticAppConfig;
  subFuture.wait();
  var myApp = OneAppApps.findOne();
  if (myApp)
    return myApp.config;
  throw new Error("there is no app config for this app");
};

Galaxy.configurePackage = function (packageName, configure) {
  var appConfig = Galaxy.getAppConfig(); // Will either be based in the env var,
                                         // or wait for galaxy to connect.
  var lastConfig = appConfig && appConfig.packages && appConfig.packages[packageName];
  if (lastConfig) {
    configure(lastConfig);
  }
  var configureIfDifferent = function (app) {
    if (!EJSON.equals(app.config && app.config.packages && app.config.packages[packageName],
                      lastConfig)) {
      lastConfig = app.config.packages[packageName];
      configure(lastConfig);
    }
  };
  var subHandle;
  var observed = new Future();

  // This is not required to finish, so defer it so it doesn't block anything
  // else.
  Meteor.defer( function () {
    collectionFuture.wait();
    subHandle = OneAppApps.find().observe({
      added: configureIfDifferent,
      changed: configureIfDifferent
    });
    observed.return();
  });

  return {
    stop: function () {
      observed.wait();
      subHandle.stop();
    }
  };
};


Galaxy.configureService = function (serviceName, configure) {
  if (ultra) {
    collectionFuture.wait();
    ultra.subscribe('servicesByName', serviceName);
    return Services.find({name: serviceName}).observe({
      added: configure,
      changed: configure
    });
  }

};
