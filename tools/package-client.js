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
  var finalCollections = {};
//  var packages = ["versions", "packages", "builds"];
  var packages = [];
  _.forEach(packages, function(file) {
    var filepath = config.getPackagesCollections() + file + ".json";
    var parsed = requre(filepath);
    finalCollections[file] = parsed;
  })

  // Return them all.
  return finalCollections;
}

var loadRemotePackageData = function (syncToken) {
  var conn = openPackageServerConnection();
  var collectionData = conn.call('syncNewPackageData', syncToken);
  conn.close();
  console.log(collectionData);
  return collectionData;
}

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
        Meteor.Collection)(key, {
          connection: null
        });
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
        Meteor.Collection)(key, {
          connection: null
        });
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
  fs.writeFileSync(config.getPackagesSyncToken(), JSON.stringify(syncToken, null, 2));
  console.log("New", syncToken);

  // Write each collection to disk in its separate file.
  _.forEach(collectionData, function(collection, key) {
    var filepath = path.join(config.getPackagesCollections(), key + ".json");
    fs.writeFileSync(filepath, JSON.stringify(collection.find().fetch(), null, 2));
  })
}

loadPackageData = function() {
  var syncToken = require(config.getPackagesSyncToken());
  console.log("OLD", syncToken);

  //XXX: We can consider optimizing this with concurrency or something.
  var remoteData = loadRemotePackageData(syncToken);
  var localCollections = loadLocalPackageData();
  var allPackageData = mergeCollections(localCollections, remoteData.collections);
  writePackagesToDisk(remoteData.syncToken, allPackageData);
  return allPackageData;
}

// XXX onReconnect
exports.loggedInPackagesConnection = function () {

  if (! auth.isLoggedIn()) {
    auth.doUsernamePasswordLogin({ retry: true });
  }

  var conn = openPackageServerConnection();
  var serviceConfigurations = new (getLoadedPackages()['meteor'].
        Meteor.Collection)('meteor_accounts_loginServiceConfiguration', {
          connection: conn
        });
  var fut = new Future();
  var serviceConfigurationsSub = conn.subscribe(
    'meteor.loginServiceConfiguration',
    fut.resolver()
  );
  fut.wait();

  var accountsConfiguration = serviceConfigurations.findOne({
    service: 'meteor-developer'
  });

  if (! accountsConfiguration) {
    return null;
  }

  var clientId = accountsConfiguration.clientId;
  var loginResult;

  if (! auth.getSessionToken(config.getPackageServerDomain())) {
    // Since we passed retry: true, we shouldn't ever get to this point
    // unless we are now logged in with the accounts server.
    var redirectUri = config.getPackageServerUrl() +
          '/_oauth/meteor-developer?close';
    loginResult = auth.oauthFlow(conn, clientId, redirectUri,
                                     config.getPackageServerDomain(),
                                     'package-server');
    if (! loginResult) {
      conn.close();
      return null;
    }
  } else {
    loginResult = conn.apply('login', [{
      resume: auth.getSessionToken(config.getPackageServerDomain())
    }], { wait: true });
    if (! loginResult || ! loginResult.token || ! loginResult.id) {
      conn.close();
      return null;
    }
  }
  return conn;
};
