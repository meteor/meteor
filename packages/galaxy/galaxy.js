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
    // TODO: parse env variables into a fake app config if we don't have one.
    staticAppConfig = JSON.parse(process.env.APP_CONFIG);
  } else {
    staticAppConfig = {
      packages: {
        'mongo-livedata': {
          url: process.env.MONGO_URL
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
  var myApp = oneAppApps.findOne();
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
  Meteor.startup(function () {
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
    ultra.subscribe('servicesByName', serviceName);
    return Services.find({name: serviceName}).observe({
      added: configure,
      changed: configure
    });
  }

};
