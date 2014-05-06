var fs = require('fs');
var path = require('path');
var Future = require('fibers/future');
var _ = require('underscore');
var auth = require('./auth.js');
var config = require('./config.js');
var httpHelpers = require('./http-helpers.js');
var release = require('./release.js');
var files = require('./files.js');
var ServiceConnection = require('./service-connection.js');

// Use uniload to load the packages that we need to open a connection to the
// current package server and use minimongo in memory. We need the following
// packages.
//
// meteor: base package and prerequsite for all others.
// livedata: DDP client interface to make a connection to the package server.
//
// Like all tools, this uses the current release to find the right versions.
// XXX: Does it really?
var getLoadedPackages = _.once(function () {
  var uniload = require('./uniload.js');
  return uniload.load({
    packages: [ 'meteor', 'livedata', 'mongo-livedata']
  });
});


// Opens a DDP connection to a package server. Loads the packages needed for a
// DDP connection, then calls DDP connect to the package server URL in config,
// using a current user-agent header composed by http-helpers.js.
var openPackageServerConnection = function () {
  return new ServiceConnection(
    getLoadedPackages(),
    config.getPackageServerUrl(),
    { 'User-Agent': httpHelpers.getUserAgent() }
  );
};


// Load the package data that was saved in the local data.json collection from
// the last time we did a sync to the server. This return object consists of
//
//  - collections: an object keyed by the name of server collections, with the
//    records as an array of javascript objects.
//  - syncToken: a syncToken object representing the last time that we talked to
//    the server, to pass into the getRemotePackageData to get the latest
//    updates.
// If there is no data.json file, or the file cannot be parsed, return null for
// the collections and a default syncToken to ask the server for all the data
// from the beginning of time.
exports.loadCachedServerData = function () {
  var noDataToken =  {
    // XXX have a better sync token for "all"
    syncToken: {time: 'Sun, 01 Jan 2012 00:00:00 GMT'},
    collections: null
  };;

  try {
    var data = fs.readFileSync(config.getPackageStorage(), 'utf8');
  } catch (e) {
    if (e.code == 'ENOENT') {
      console.log("No cached server data found on disk.");
      return noDataToken;
    }
    // XXX we should probably return an error to the caller here to
    // figure out how to handle it
    console.log(e.message);
    process.exit(1);
  }
  var ret = noDataToken;
  try {
    ret = JSON.parse(data);
  } catch (err) {
    // XXX error handling
    console.log("Could not parse JSON in data.json.");
  }
  return ret;
};

// Opens a connection to the server, requests and returns new package data that
// we haven't cached on disk. We assume that data is cached chronologically, so
// essentially, we are asking for a diff from the last time that we did this.
// Takes in:
// - syncToken: a syncToken object to be sent to the server that
//   represents the last time that we talked to the server.
//
// Returns an object, containing the following fields:
//  - syncToken: a new syncToken object, that we can pass to the server in the future.
//  - collections: an object keyed by the name of server collections, with the
//    records as an array of javascript objects.
//
// Throws a ServiceConnection.ConnectionTimeoutError if the method call
// times out.
var loadRemotePackageData = function (syncToken) {
  var conn = openPackageServerConnection();
  try {
    var collectionData = conn.call('syncNewPackageData', syncToken);
  } finally {
    conn.close();
  }
  return collectionData;
};

// Take in an ordered list of javascript objects representing collections of
// package data. In each object, the server-side names of collections are keys
// and the values are the mongo records for that collection stored as an
// array. Goes through the the list in order and merges it into the single
// object, with collection names as keys and the arrays of records as
// corresponding values. The inputs list is ordered and records in the later
// collections will override the records in the earlier collections.
var mergeCollections = function (sources) {
  var collections = {}; // map from collection to _id to object

  _.each(sources, function (source) {
    _.each(source, function (records, collectionName) {
      if (! _.has(collections, collectionName))
        collections[collectionName] = {};

      _.each(records, function (record) {
        collections[collectionName][record._id] = record;
      });
    });
  });

  var ret = {};
  _.each(collections, function (records, collectionName) {
    ret[collectionName] = _.values(records);
  });

  return ret;
};

// Writes the cached package data to the on-disk cache. Takes in the following
// arguments:
// - syncToken : the token representing our conversation with the server, that
//   we can later use to get a diff of this cache and the new server-side data.
// - collectionData : a javascript object representing the data we have about
//   packages on the server, with collection names as keys and arrays of those
//   collection records as values.
//
// Returns nothing, but
// XXXX: Does what on errors?
var writePackageDataToDisk = function (syncToken, collectionData) {
  var finalWrite = {};
  finalWrite.syncToken = syncToken;
  finalWrite.formatVersion = "1.0";
  finalWrite.collections = {};
  _.forEach(collectionData, function(coll, name) {
    finalWrite.collections[name] = coll;
  });
  var filename = config.getPackageStorage();
  // XXX think about permissions?
  files.mkdir_p(path.dirname(filename));
  files.writeFileAtomically(filename, JSON.stringify(finalWrite, null, 2));
};

// Contacts the package server to get the latest diff and writes changes to
// disk.
//
// Takes in cachedServerData, which is the processed contents of data.json. Uses
// those to talk to the server and get the latest updates. Applies the diff from
// the server to the in-memory version of the on-disk data, then writes the new
// file to disk as the new data.json.
//
// Returns null if contacting the server times out.
exports.updateServerPackageData = function (cachedServerData) {
  var sources = [];
  if (cachedServerData.collections) {
    sources.push(cachedServerData.collections);
  }
  var syncToken = cachedServerData.syncToken;
  var remoteData;
  try {
    remoteData = loadRemotePackageData(syncToken);
  } catch (err) {
    if (err instanceof ServiceConnection.ConnectionTimeoutError) {
      return null;
    } else {
      throw err;
    }
  }
  sources.push(remoteData.collections);

  var allPackageData = mergeCollections(sources);
  writePackageDataToDisk(remoteData.syncToken, allPackageData);
  return allPackageData;
};

// Returns a logged-in DDP connection to the package server, or null if
// we cannot log in. If an error unrelated to login occurs
// (e.g. connection to package server times out), then it will be
// thrown.
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
    { connection: conn.connection }
  );
  var serviceConfigurationsSub = conn.
        subscribeAndWait('meteor.loginServiceConfiguration');

  var accountsConfiguration = serviceConfigurations.findOne({
    service: 'meteor-developer'
  });

  var cleanUp = function () {
    serviceConfigurationsSub && serviceConfigurationsSub.stop();
    conn && conn.close();
  };

  if (! accountsConfiguration || ! accountsConfiguration.clientId) {
    console.log(serviceConfigurations.find().fetch());
    cleanUp();
    return null;
  }

  var clientId = accountsConfiguration.clientId;
  var loginResult;

  // Try to log in with an existing login token, if we have one.
  var existingToken = auth.getSessionToken(config.getPackageServerDomain());
  if (existingToken) {
    try {
      loginResult = conn.apply('login', [{
        resume: existingToken
      }], { wait: true });
    } catch (err) {
      // If we get a Meteor.Error, then we swallow it and go on to
      // attempt an OAuth flow and get a new token. If it's not a
      // Meteor.Error, then we leave it to the caller to handle.
      if (! err instanceof getLoadedPackages().meteor.Meteor.Error) {
        cleanUp();
        throw err;
      }
    }

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
    if (loginResult.error === "login-failed" ||
        loginResult.error === "access-denied") {
      process.stderr.write('Error logging in to package server: ' +
                           loginResult.error + '\n');
      cleanUp();
      return null;
    } else {
      cleanUp();
      throw new Error(loginResult.error);
    }
  }
};

var hashTarball = function (tarball) {
  var crypto = require('crypto');
  var hash = crypto.createHash('sha256');
  hash.setEncoding('base64');
  var rs = fs.createReadStream(tarball);
  var fut = new Future();
  rs.on('end', function () {
    fut.return(hash.digest('base64'));
  });
  rs.pipe(hash, { end: false });
  var tarballHash = fut.wait();
  rs.close();
  return tarballHash;
};

// XXX this is missing a few things:
//    - locking down build-time dependencies: tools version, versions
//      of all (not-built-from-source) plugins used
// in general, we need to include all the stuff that goes into the watchSet
// We include npm-shrinkwrap which does not go in the watchSet but
// probably should.
//
// In retrospect a better approach here might be to actually make "save source
// somewhere else" or perhaps "add source to tarball" be part of the package
// build itself...
exports.bundleSource = function (unipackage, includeSources, packageDir) {
  var name = unipackage.name;

  var tempDir = files.mkdtemp('build-source-package-');
  var packageTarName = name + '-' + unipackage.version + '-source';
  var dirToTar = path.join(tempDir, 'source', packageTarName);
  var sourcePackageDir = path.join(
    dirToTar,
    name
  );
  if (! files.mkdir_p(sourcePackageDir)) {
    process.stderr.write('Failed to create temporary source directory: ' +
                         sourcePackageDir);
    return null;
  }

  includeSources.push('package.js');
  if (fs.existsSync('.npm/package/npm-shrinkwrap.json')) {
    includeSources.push('.npm/package/npm-shrinkwrap.json');
  }
  _.each(unipackage.plugins, function (plugin, pluginName) {
    var pluginShrinkwrap = path.join('.npm/plugin/', pluginName,
                                     'npm-shrinkwrap.json');
    if (fs.existsSync(pluginShrinkwrap)) {
      includeSources.push(pluginShrinkwrap);
    }
  });

  // We copy source files into a temp directory and then tar up the temp
  // directory. It would be great if we could avoid the copy, but as far
  // as we can tell, this is the only way to get a tarball with the
  // directory structure that we want (<package name>-<version-source/
  // at the top level).
  files.cp_r(packageDir, sourcePackageDir, {
    include: includeSources
  });

  // We put this inside the temp dir because mkdtemp makes sure that the
  // temp dir gets cleaned up on process exit, so we don't have to worry
  // about cleaning up our tarball (or our copied source files)
  // ourselves.
  var sourceTarball = path.join(tempDir, packageTarName + '.tgz');
  files.createTarball(dirToTar, sourceTarball);

  var tarballHash = hashTarball(sourceTarball);

  return {
    sourceTarball: sourceTarball,
    tarballHash: tarballHash
  };
};

var uploadTarball = function (putUrl, tarball) {
  var size = fs.statSync(tarball).size;
  var rs = fs.createReadStream(tarball);
  httpHelpers.request({
    method: 'PUT',
    url: putUrl,
    headers: {
      'content-length': size,
      'content-type': 'application/octet-stream',
      'x-amz-acl': 'public-read'
    },
    bodyStream: rs
  });
  rs.close();
};

exports.uploadTarball = uploadTarball;

var bundleBuild = function (unipackage, packageDir) {
  var tempDir = files.mkdtemp('build-package-');
  var packageTarName = unipackage.name + '-' + unipackage.version + '-' +
        unipackage.architectures().join('+');
  var tarInputDir = path.join(tempDir, packageTarName);

  files.cp_r(path.join(packageDir, '.build.' + unipackage.name), tarInputDir);

  // Don't upload buildinfo.json. It's only of interest locally (for
  // example, it contains a watchset with local paths).
  var buildInfoPath = path.join(tarInputDir, 'buildinfo.json');
  if (fs.existsSync(buildInfoPath))
    fs.unlinkSync(buildInfoPath);

  var buildTarball = path.join(tempDir, packageTarName + '.tgz');
  files.createTarball(tarInputDir, buildTarball);

  var tarballHash = hashTarball(buildTarball);

  return {
    buildTarball: buildTarball,
    tarballHash: tarballHash
  };
};

exports.bundleBuild = bundleBuild;

exports.createAndPublishBuiltPackage = function (conn, unipackage, packageDir) {
  process.stdout.write('Creating package build...\n');
  var uploadInfo = conn.call('createPackageBuild', {
    packageName: unipackage.name,
    version: unipackage.version,
    architecture: unipackage.architectures().join('+')
  });

  var bundleResult = bundleBuild(unipackage, packageDir);

  process.stdout.write('Uploading build...\n');
  uploadTarball(uploadInfo.uploadUrl,
                bundleResult.buildTarball);

  process.stdout.write('Publishing package build...\n');
  conn.call('publishPackageBuild',
            uploadInfo.uploadToken, bundleResult.tarballHash);

  conn.close();
  process.stdout.write('Published ' + unipackage.name +
                       ', version ' + unipackage.version);

  process.stdout.write('\nDone!\n');
};

exports.handlePackageServerConnectionError = function (error) {
  var Package = getLoadedPackages();
  if (error instanceof Package.meteor.Meteor.Error) {
    process.stderr.write("Error connecting to package server");
    if (error.message) {
      process.stderr.write(": " + error.message);
    }
    process.stderr.write("\n");
  } else if (error instanceof ServiceConnection.ConnectionTimeoutError) {
    process.stderr.write("Connection to package server timed out.\n");
  } else {
    throw error;
  }
};
