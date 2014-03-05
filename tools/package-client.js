var auth = require('./auth.js');
var config = require('./config.js');
var httpHelpers = require('./http-helpers.js');
var release = require('./release.js');
var fs = require('fs');
var path = require('path');
var Future = require('fibers/future');
var _ = require('underscore');

var getLoadedPackages = _.once(function () {
  var unipackage = require('./unipackage.js');
  return unipackage.load({
    library: release.current.library,
    packages: [ 'meteor', 'livedata', 'minimongo', 'mongo-livedata' ],
    release: release.current.name
  });
});

var openPackageServerConnection = function () {
  var DDP = getLoadedPackages().livedata.DDP;
  return DDP.connect(config.getPackageServerUrl(), {
    headers: { 'User-Agent': httpHelpers.getUserAgent() }
  });
};

var loadLocalPackageData = function () {
  var finalCollections = require(config.getPackageStorage());
  return finalCollections;
};

var loadRemotePackageData = function (syncToken) {
  var conn = openPackageServerConnection();
  var collectionData = conn.call('syncNewPackageData', syncToken);
  conn.close();
  return collectionData;
};

// Takes in two javascript objects of the form:
//  { collectionName : arrayOfRecords }
// and converts them to a javascript object of the form
//  { collectionName : miniMongoCollection }
// where the miniMongo collection contains all of the records from
// both objects and the updateCollection overrides the first.
var mergeCollections = function (coll1, collUpdate) {
  var finalCollections = {};
  // Start collections. Insert records.
  var meteorServer = getLoadedPackages()['meteor'];
  _.forEach(coll1, function (records, key) {
     finalCollections[key] = new (getLoadedPackages()['meteor'].
        Meteor.Collection)(null);
     _.forEach(records, function (record) {
       if (!finalCollections[key].findOne(record._id)) {
         finalCollections[key].insert(record);
       }
     })
   });

  // Add the second batch in.
  _.forEach(collUpdate, function (records, key) {
    if (!_.has(finalCollections, key)) {
      finalCollections[key] = new (meteorServer.
        Meteor.Collection)(null);
    }
    _.forEach(records, function (record) {
      finalCollections[key].remove(record._id);
      finalCollections[key].insert(record);
    })
  });

  // And return.
  return finalCollections;
}

var writePackagesToDisk = function (syncToken, collectionData) {
  var finalWrite = {};
  finalWrite.syncToken = syncToken;
  finalWrite.formatVersion = "1.0";
  finalWrite.collections = {};
  _.forEach(collectionData, function(coll, name) {
    finalWrite.collections[name] = coll.find().fetch();
  })
  fs.writeFileSync(config.getPackageStorage(),
                   JSON.stringify(finalWrite, null, 2));
}

loadPackageData = function() {
  //XXX: We can consider optimizing this with concurrency or something.
  var localData = loadLocalPackageData();
  var syncToken = localData.syncToken;
  var localCollections = localData.collections;
  var remoteData = loadRemotePackageData(syncToken);
  var allPackageData = mergeCollections(localCollections, remoteData.collections);
  writePackagesToDisk(remoteData.syncToken, allPackageData);
  return allPackageData;
}

// XXX onReconnect
// Returns a logged-in DDP connection to the package server, or null if
// we cannot log in.
// XXX needs a timeout
exports.loggedInPackagesConnection = function () {
  // Make sure that we are logged in with Meteor Accounts so that we can
  // do an OAuth flow.
  if (! auth.isLoggedIn()) {
    auth.doUsernamePasswordLogin({ retry: true });
  }

  var conn = openPackageServerConnection();

  var setUpOnReconnect = function () {
    conn.onReconnect = function () {
      conn.apply('login', [{
        resume: auth.getSessionToken(config.getPackageServerDomain())
      }], { wait: true }, function () { });
    };
  };

  // Subscribe to the package server's service configurations so that we
  // can get the OAuth client ID to kick off the OAuth flow.
  var serviceConfigurations = new (getLoadedPackages().meteor.Meteor.Collection)(
    'meteor_accounts_loginServiceConfiguration',
    { connection: conn }
  );
  var serviceConfigurationsSub = conn.
        _subscribeAndWait('meteor.loginServiceConfiguration');

  var accountsConfiguration = serviceConfigurations.findOne({
    service: 'meteor-developer'
  });

  var cleanUp = function () {
    serviceConfigurationsSub.stop();
    conn.close();
  };

  if (! accountsConfiguration || ! accountsConfiguration.clientId) {
    cleanUp();
    return null;
  }

  var clientId = accountsConfiguration.clientId;
  var loginResult;

  // Try to log in with an existing login token, if we have one.
  var existingToken = auth.getSessionToken(config.getPackageServerDomain());
  if (existingToken) {
    loginResult = conn.apply('login', [{
      resume: existingToken
    }], { wait: true });

    if (loginResult && loginResult.token && loginResult.id) {
      // Success!
      setUpOnReconnect();
      return conn;
    }
  }

  // Either we didn't have an existing token, or it didn't work. Do an
  // OAuth flow to log in.
  var redirectUri = config.getPackageServerUrl() +
        '/_oauth/meteor-developer?close';
  loginResult = auth.oauthFlow(conn, {
    clientId: clientId,
    redirectUri: redirectUri,
    domain: config.getPackageServerDomain(),
    sessionType: 'package-server'
  });

  if (loginResult && ! loginResult.error) {
    setUpOnReconnect();
    return conn;
  } else {
    process.stderr.write('Error logging in to package server: ' +
                         loginResult.error + '\n');
    cleanUp();
    return null;
  }
};
