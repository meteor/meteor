var Future = Npm.require("fibers/future");

AppConfig = {};


AppConfig.findGalaxy = _.once(function () {
  if (!('GALAXY' in process.env || 'ULTRAWORLD_DDP_ENDPOINT' in process.env)) {
    return null;
  }
  return Follower.connect(process.env.ULTRAWORLD_DDP_ENDPOINT || process.env.GALAXY);
});

var ultra = AppConfig.findGalaxy();

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
      connection: ultra
    });
    // allow us to block on the collections being ready
    collectionFuture.return();
  }
});

// XXX: Remove this once we allow the same collection to be new'd from multiple
// places.
AppConfig._getAppCollection = function () {
  collectionFuture.wait();
  return OneAppApps;
};

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
          url: process.env.MONGO_URL,
          oplog: process.env.MONGO_OPLOG_URL
        }
      }
    };
  }
} catch (e) {
  Log.warn("Could not parse initial APP_CONFIG environment variable");
};

AppConfig.getAppConfig = function () {
  if (!subFuture.isResolved() && staticAppConfig) {
    return staticAppConfig;
  }
  subFuture.wait();
  var myApp = OneAppApps.findOne(process.env.GALAXY_APP);
  if (myApp)
    return myApp.config;
  throw new Error("there is no app config for this app");
};

AppConfig.configurePackage = function (packageName, configure) {
  var appConfig = AppConfig.getAppConfig(); // Will either be based in the env var,
                                         // or wait for galaxy to connect.
  var lastConfig =
        (appConfig && appConfig.packages && appConfig.packages[packageName]) || {};
  // Always call the configure callback "soon" even if the initial configuration
  // is empty (synchronously, though deferred would be OK).
  // XXX make sure that all callers of configurePackage deal well with multiple
  // callback invocations!  eg, email does not
  configure(lastConfig);
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
    // there's a Meteor.startup() that produces the various collections, make
    // sure it runs first before we continue.
    collectionFuture.wait();
    subHandle = OneAppApps.find(process.env.GALAXY_APP).observe({
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


AppConfig.configureService = function (serviceName, configure) {
  if (ultra) {
    // there's a Meteor.startup() that produces the various collections, make
    // sure it runs first before we continue.
    collectionFuture.wait();
    ultra.subscribe('servicesByName', serviceName);
    return Services.find({name: serviceName}).observe({
      added: configure,
      changed: configure
    });
  }

};
