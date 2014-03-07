var auth = require('./auth.js');
var config = require('./config.js');
var httpHelpers = require('./http-helpers.js');
var release = require('./release.js');
var files = require('./files.js');
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
  // XXX pretty error handling
  try {
    var data = fs.readFileSync(config.getPackageStorage(), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw e;
    // Default: no data, send us everything.
    return {
      // XXX have a better sync token for "all"
      syncToken: {time: 'Sun, 01 Jan 2012 00:00:00 GMT'},
      collections: null
    };
  }
  return JSON.parse(data);
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
var createCollections = function (sources) {
  var finalCollections = {};
  // Start collections. Insert records.
  var meteorServer = getLoadedPackages()['meteor'];

  _.each(sources, function (source) {
    _.each(source, function (records, key) {
      if (!_.has(finalCollections, key)) {
        finalCollections[key] = new (meteorServer.Meteor.Collection)(null);
      }
      _.each(records, function (record) {
        finalCollections[key].remove(record._id);
        finalCollections[key].insert(record);
      });
    });
  });

  return finalCollections;
};

var writePackagesToDisk = function (syncToken, collectionData) {
  var finalWrite = {};
  finalWrite.syncToken = syncToken;
  finalWrite.formatVersion = "1.0";
  finalWrite.collections = {};
  _.forEach(collectionData, function(coll, name) {
    finalWrite.collections[name] = coll.find().fetch();
  });
  var filename = config.getPackageStorage();
  // XXX think about permissions?
  files.mkdir_p(path.dirname(filename));
  files.writeFileAtomically(filename, JSON.stringify(finalWrite, null, 2));
};

exports.loadPackageData = function() {
  //XXX: We can consider optimizing this with concurrency or something.
  var sources = [];

  var localData = loadLocalPackageData();
  if (localData.collections)
    sources.push(localData.collections);
  var syncToken = localData.syncToken;
  // XXX support offline use too
  var remoteData = loadRemotePackageData(syncToken);
  sources.push(remoteData.collections);

  var allPackageData = createCollections(sources);
  writePackagesToDisk(remoteData.syncToken, allPackageData);
  return allPackageData;
};

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
exports.bundleSource = function (pkg, packageDir) {
  var name = pkg.name;
  var version = pkg.metadata.version;

  var tempDir = files.mkdtemp('build-source-package-');
  var packageTarName = name + '-' + version + '-source';
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

  var includeSources = _.clone(pkg.sources);
  includeSources.push('package.js');
  if (fs.existsSync('.npm/package/npm-shrinkwrap.json')) {
    includeSources.push('.npm/package/npm-shrinkwrap.json');
  }
  _.each(pkg.plugins, function (plugin, pluginName) {
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

exports.uploadTarball = function (putUrl, tarball) {
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

exports.bundleBuild = function (pkg, packageDir) {
  var tempDir = files.mkdtemp('build-package-');
  var packageTarName = pkg.name + '-' + pkg.metadata.version + '-' +
        pkg.architectures().join('+');
  var tarInputDir = path.join(tempDir, packageTarName);

  files.cp_r(path.join(packageDir, '.build'), tarInputDir);

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
