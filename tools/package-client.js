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
var utils = require('./utils.js');
var buildmessage = require('./buildmessage.js');
var compiler = require('./compiler.js');
var uniload = require('./uniload.js');
var Console = require('./console.js').Console;

// Use uniload to load the packages that we need to open a connection to the
// current package server and use minimongo in memory. We need the following
// packages.
//
// meteor: base package and prerequsite for all others.
// ddp: DDP client interface to make a connection to the package server.
var getLoadedPackages = function () {
  return uniload.load({
    packages: [ 'meteor', 'ddp']
  });
};

// Opens a DDP connection to a package server. Loads the packages needed for a
// DDP connection, then calls DDP connect to the package server URL in config,
// using a current user-agent header composed by http-helpers.js.
var openPackageServerConnection = function (packageServerUrl) {
  return new ServiceConnection(
    getLoadedPackages(),
    packageServerUrl || config.getPackageServerUrl(),
    {headers: {"User-Agent": httpHelpers.getUserAgent()},
     _dontPrintErrors: true});
};

var emptyCachedServerDataJson = function () {
  return {
    syncToken: { format: "1.1" },
    collections: null
  };
};

// Given a connection, makes a call to the package server.  (Checks to see if
// the connection is connected, and reconnects if needed -- a workaround for
// the fact that connections in the tool do not reconnect)
exports.callPackageServer = function (conn) {
  if (!conn.connected) {
    conn.close();
    conn = exports.loggedInPackagesConnection();
  }
  var args = _.values(arguments)
    .slice(1, arguments.length);
  return conn.call.apply(conn, args);
};

// Requests and returns one page of new package data that we haven't cached on
// disk. We assume that data is cached chronologically, so essentially, we are
// asking for a diff from the last time that we did this.
// Takes in:
// - conn: the connection to use (does not have to be logged in)
// - syncToken: a syncToken object to be sent to the server that
//   represents the last time that we talked to the server.
// - _optionsForTest:
//    - useShortPages (Boolean). Ask the server for pages of ~3 records
//      instead of ~100, for testing pagination.
//
// Returns an object, containing the following fields:
//  - syncToken: a new syncToken object, that we can pass to the server in the future.
//  - collections: an object keyed by the name of server collections, with the
//    records as an array of javascript objects.
var loadRemotePackageData = function (conn, syncToken, _optionsForTest) {
  _optionsForTest = _optionsForTest || {};

  var syncOpts;
  if (_optionsForTest && _optionsForTest.useShortPages) {
    syncOpts = { shortPagesForTest: _optionsForTest.useShortPages };
  }
  var collectionData;
  if (syncOpts) {
    collectionData = exports.callPackageServer(conn,
        'syncNewPackageData', syncToken, syncOpts);
  } else {
    collectionData = exports.callPackageServer(conn,
        'syncNewPackageData', syncToken);
  }
  return collectionData;
};

// Contacts the package server to get the latest diff and writes changes to
// disk.
//
// Takes in the dataStore, which is an example of the remote catalog. Contacts
// the package server and updates the sql database with the most recent
// information.
//
// Returns null if contacting the server times out, or an object with the
// following keys:
//     resetData : true if we should reset the database, otherwise false.
//     connectionFailed: true if we failed to connect to the server.
//
// options can include:
//  - packageStorageFile: String. The file to write the data to (overrides
//    `config.getPackageStorage()`)
//  - packageServerUrl: String. The package server (overrides
//    `config.getPackageServerUrl()`)
//  - useShortPages: Boolean. Request short pages of ~3 records from the
//    server, instead of ~100 that it would send otherwise
exports.updateServerPackageData = function (dataStore, options) {
  var results;
  buildmessage.capture({ title: 'Updating package catalog' }, function () {
    results = _updateServerPackageData(dataStore, options);
  });
  return results;
};


_updateServerPackageData = function (dataStore, options) {
  var self = this;
  options = options || {};
  if (dataStore === null)
    throw Error("Data store expected");

  var done = false;
  var ret = {resetData: false};

  var start = undefined;
  var state = { current: 0, end: 10, done: false};
  buildmessage.reportProgress(state);

  try {
    var conn = openPackageServerConnection(options.packageServerUrl);
  } catch (err) {
    self.handlePackageServerConnectionError(err);
    ret.connectionFailed = true;
    return ret;
  }

  // Provide some progress indication for connection
  // XXX though it is just a hack
  state.current = 1;
  buildmessage.reportProgress(state);

  var getSomeData = function () {
    var syncToken = dataStore.getSyncToken() || {};

    if (!start) {
      start = {};
      start.builds = syncToken.builds;
      start.versions = syncToken.versions;
      state.end = (Date.now() - start.builds) + (Date.now() - start.versions);
    }
    // XXX: This is a hack... syncToken should have a % done
    state.current =
      (syncToken.builds - start.builds) +
      (syncToken.versions - start.versions);
    buildmessage.reportProgress(state);

    var remoteData;
    try {
      remoteData = loadRemotePackageData(conn, syncToken, {
        useShortPages: options.useShortPages
      });
    } catch (err) {
      exports.handlePackageServerConnectionError(err);
      if (err.errorType === "DDP.ConnectionError") {
        done = true;
        return;
      } else {
        throw err;
      }
    }

    // Is the remote server telling us to ignore everything we've heard before?
    // OK, we can do that.
    if (remoteData.resetData) {
      dataStore.reset();
      // The caller may want to take this as a cue to delete packages from the
      // tropohouse.
      ret.resetData = true;
    }

    // We always write to the data store; the fact there is no data is itself
    // data!  e.g. the last-refresh timestamp
    var syncComplete =
          _.isEqual(remoteData.collections, {}) || remoteData.upToDate;
    dataStore.insertData(remoteData, syncComplete);

    // If there is no new data from the server, don't bother writing things to
    // disk (unless we were just told to reset everything).
    if (!remoteData.resetData && _.isEqual(remoteData.collections, {})) {
      done = true;
      return;
    }

    if (remoteData.upToDate) {
      done = true;
    }
  };

  try {
    while (!done) {
      getSomeData();
    }
  } finally {
    conn.close();
  }

  state.done = true;
  buildmessage.reportProgress(state);

  return ret;
};

var AlreadyPrintedMessageError = function () {};

// Returns a logged-in DDP connection to the package server, or null if
// we cannot log in. If an error unrelated to login occurs
// (e.g. connection to package server times out), then it will be
// thrown.
exports.loggedInPackagesConnection = function () {
  // Make sure that we are logged in with Meteor Accounts so that we can
  // do an OAuth flow.

  if (auth.maybePrintRegistrationLink({onlyAllowIfRegistered: true})) {
    // Oops, we're logged in but with a deferred-registration account.
    // Message has already been printed.
    throw new AlreadyPrintedMessageError;
  }

  if (! auth.isLoggedIn()) {
    // XXX we should have a better account signup page.
    Console.stderr.write(
"Please log in with your Meteor developer account. If you don't have one,\n" +
"you can quickly create one at www.meteor.com.\n");
    auth.doUsernamePasswordLogin({ retry: true });
  }

  var conn = openPackageServerConnection();

  var accountsConfiguration = auth.getAccountsConfiguration(conn);

  try {
    auth.loginWithTokenOrOAuth(
      conn,
      accountsConfiguration,
      config.getPackageServerUrl(),
      config.getPackageServerDomain(),
      "package-server"
    );
  } catch (err) {
    if (err.message === "access-denied") {
      // Maybe we thought we were logged in, but our token had been
      // revoked.
      Console.stderr.write(
"It looks like you have been logged out! Please log in with your Meteor\n" +
"developer account. If you don't have one, you can quickly create one\n" +
"at www.meteor.com.\n");
      auth.doUsernamePasswordLogin({ retry: true });
      auth.loginWithTokenOrOAuth(
        conn,
        accountsConfiguration,
        config.getPackageServerUrl(),
        config.getPackageServerDomain(),
        "package-server"
      );
    } else {
      throw err;
    }
  }
  return conn;
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
var bundleSource = function (unipackage, includeSources, packageDir) {
  var name = unipackage.name;

  var tempDir = files.mkdtemp('build-source-package-');
  var packageTarName = name + '-' + unipackage.version + '-source';
  var dirToTar = path.join(tempDir, 'source', packageTarName);
  var sourcePackageDir = path.join(
    dirToTar,
    name
  );
  if (! files.mkdir_p(sourcePackageDir)) {
    Console.stderr.write('Failed to create temporary source directory: ' +
                         sourcePackageDir);
    return null;
  }

  includeSources.push('package.js');
  if (fs.existsSync(path.join(packageDir, '.npm/package/npm-shrinkwrap.json'))) {
    includeSources.push('.npm/package/npm-shrinkwrap.json');
  }
  _.each(unipackage.plugins, function (plugin, pluginName) {
    var pluginShrinkwrap = path.join('.npm/plugin/', pluginName,
                                     'npm-shrinkwrap.json');
    if (fs.existsSync(path.join(packageDir, pluginShrinkwrap))) {
      includeSources.push(pluginShrinkwrap);
    }
  });

  // We copy source files into a temp directory and then tar up the temp
  // directory. It would be great if we could avoid the copy, but as far
  // as we can tell, this is the only way to get a tarball with the
  // directory structure that we want (<package name>-<version-source/
  // at the top level).
  _.each(includeSources, function (f) {
    files.copyFile(path.join(packageDir, f),
                   path.join(sourcePackageDir, f));
  });

  // We put this inside the temp dir because mkdtemp makes sure that the
  // temp dir gets cleaned up on process exit, so we don't have to worry
  // about cleaning up our tarball (or our copied source files)
  // ourselves.
  var sourceTarball = path.join(tempDir, packageTarName + '.tgz');
  files.createTarball(dirToTar, sourceTarball);

  var tarballHash = files.fileHash(sourceTarball);
  var treeHash = files.treeHash(dirToTar);

  return {
    sourceTarball: sourceTarball,
    tarballHash: tarballHash,
    treeHash: treeHash
  };
};

var uploadTarball = function (putUrl, tarball) {
  var size = fs.statSync(tarball).size;
  var rs = fs.createReadStream(tarball);
  try {
    // Use getUrl instead of request, to throw on 4xx/5xx.
    httpHelpers.getUrl({
      method: 'PUT',
      url: putUrl,
      headers: {
        'content-length': size,
        'content-type': 'application/octet-stream',
        'x-amz-acl': 'public-read'
      },
      bodyStream: rs
    });
  } finally {
    rs.close();
  }
};

exports.uploadTarball = uploadTarball;

var bundleBuild = function (unipackage) {
  buildmessage.assertInJob();

  var tempDir = files.mkdtemp('build-package-');
  var packageTarName = unipackage.tarballName();
  var tarInputDir = path.join(tempDir, packageTarName);

  unipackage.saveToPath(tarInputDir, {
    // Don't upload buildinfo.json. It's only of interest locally (for example,
    // it contains a watchset with local paths).  (This also means we don't
    // need to specify a catalog, yay.)
    elideBuildInfo: true
  });

  var buildTarball = path.join(tempDir, packageTarName + '.tgz');
  files.createTarball(tarInputDir, buildTarball);

  var tarballHash = files.fileHash(buildTarball);
  var treeHash = files.treeHash(tarInputDir, {
    // We don't include any package.json from an npm module in the tree hash,
    // because npm isn't super consistent about what it puts in there (eg, does
    // it include the "readme" field)? This ends up leading to spurious
    // differences. The tree hash will still notice any actual CODE changes in
    // the npm packages.
    ignore: function (relativePath) {
      var pieces = relativePath.split(path.sep);
      return pieces.length && _.last(pieces) === 'package.json'
        && _.contains(pieces, 'npm');
    }
  });

  return {
    buildTarball: buildTarball,
    tarballHash: tarballHash,
    treeHash: treeHash
  };
};

exports.bundleBuild = bundleBuild;

var createAndPublishBuiltPackage = function (conn, unipackage) {
  buildmessage.assertInJob();

  // Note: we really want to do this before createPackageBuild, because the URL
  // we get from createPackageBuild will expire!
  Console.stdout.write('Bundling build...\n');
  var bundleResult = bundleBuild(unipackage);
  if (buildmessage.jobHasMessages())
    return;

  Console.stdout.write('Creating package build...\n');
  var uploadInfo = exports.callPackageServer(conn,
    'createPackageBuild', {
      packageName: unipackage.name,
      version: unipackage.version,
      buildArchitectures: unipackage.buildArchitectures()
  });

  Console.stdout.write('Uploading build...\n');
  uploadTarball(uploadInfo.uploadUrl,
                bundleResult.buildTarball);

  Console.stdout.write('Publishing package build...\n');
  exports.callPackageServer(conn,
            'publishPackageBuild',
            uploadInfo.uploadToken,
            bundleResult.tarballHash,
            bundleResult.treeHash);

  Console.stdout.write('Published ' + unipackage.name +
                       ', version ' + unipackage.version);

  Console.stdout.write('\nDone!\n');
};

exports.createAndPublishBuiltPackage = createAndPublishBuiltPackage;

exports.handlePackageServerConnectionError = function (error) {
  if (error instanceof AlreadyPrintedMessageError) {
    // do nothing
  } else if (error.errorType === 'Meteor.Error') {
    Console.stderr.write("Error from package server");
    if (error.message) {
      Console.stderr.write(": " + error.message);
    }
    Console.stderr.write("\n");
  } else if (error.errorType === "DDP.ConnectionError") {
    Console.stderr.write("Error connecting to package server: "
                         + error.message + "\n");
  } else {
    throw error;
  }
};

// Publish the package information into the server catalog. Create new records
// for the package (if needed), the version and the build; upload source and
// unipackage.
//
// packageSource: the packageSource for this package.
// compileResult: the compiled unipackage and various source files.
// conn: the open, logged-in connection over which we should talk to the package
//       server. DO NOT CLOSE this connection here.
// options:
//      new: this package is new, we should call createPackage to create a new
//           package record.
//      existingVersion: we expect the version to exist already, and for us
//           to merely be providing a new build of the same source
//
// Return true on success and an error code otherwise.
exports.publishPackage = function (packageSource, compileResult, conn, options) {
  buildmessage.assertInJob();

  options = options || {};

  if (options.new && options.existingVersion)
    throw Error("is it new or does it exist?!?");

  var name = packageSource.name;
  var version = packageSource.version;

  // Check that the package name is valid.
  try {
    utils.validatePackageName(name);
  } catch (e) {
    if (!e.versionParserError)
      throw e;
    Console.stderr.write(e.error + "\n");
    return 1;
  }

  // Check that we have a version.
  if (! version) {
    Console.stderr.write(
     "That package cannot be published because it doesn't have a version.\n");
    return 1;
  }

  // Check that the version description is under the character limit. (We check
  // all string limits on the server, but this is the one that is mostly likely
  // to be wrong)
  if (!packageSource.metadata.summary) {
    Console.stderr.write("Please describe what your package does. \n");
    Console.stderr.write("Set a summary in Package.describe in package.js. \n");
    return 1;
  }

  if (packageSource.metadata.summary &&
      packageSource.metadata.summary.length > 100) {
    Console.stderr.write("Description must be under 100 chars. \n");
    Console.stderr.write("Publish failed. \n");
    return 1;
  }

  var catalog = require('./catalog.js');

  // Check that we are an authorized maintainer of this package.
  if (!options['new']) {
    var packRecord = catalog.official.getPackage(name);
    if (!packRecord) {
      Console.stderr.write('There is no package named ' + name +
                           '. If you are creating a new package, use the --create flag. \n');
      Console.stderr.write("Publish failed. \n");
      return 1;
    }

    if (!exports.amIAuthorized(name, conn, false)) {
      Console.stderr.write('You are not an authorized maintainer of ' + name + ".\n");
      Console.stderr.write('Only authorized maintainers may publish new versions. \n');
      return 1;
    }
  }

  // Check that the package does not have any unconstrained references.
  var packageDeps =  packageSource.getDependencyMetadata();
  var badConstraints = [];
  _.each(packageDeps, function(refs, label) {
    // HACK: we automatically include the meteor package and there is no way for
    // anyone to set its dependency data correctly, so I guess we shouldn't
    // penalize the user for not doing that. It will be resolved at runtime
    // anyway.
    if (label !== "meteor" &&
        refs.constraint == null) {
      badConstraints.push(label);
    }
  });

  // If we are not a core package and some of our constraints are unspecified,
  // then we should force the user to specify them. This is because we are not
  // sure about pre-0.90 package versions yet.
  if (!packageSource.isCore && !_.isEqual(badConstraints, [])) {
    Console.stderr.write(
"You must specify a version constraint for the following packages:");
    _.each(badConstraints, function(bad) {
      Console.stderr.write(" " + bad);
    });
    process.exit(1);
  }

  // We need to build the test package to get all of its sources.
  var testFiles = [];
  var messages = buildmessage.capture(
    { title: "getting test sources" },
    function () {
      var testName = packageSource.testName;
      if (testName) {
        var PackageSource = require('./package-source.js');
        var compiler = require('./compiler.js');

        var testSource = new PackageSource(catalog.complete);
        // We need to pass in the name of the test package in order to
        // initialize it. Otherwise, the defaul behaviour will be to initalize
        // the base package.
        testSource.initFromPackageDir(packageSource.sourceRoot, {
          name: testName
        });
        if (buildmessage.jobHasMessages())
          return; // already have errors, so skip the build

        var testUnipackage = compiler.compile(testSource, { officialBuild: true });
        testFiles = testUnipackage.sources;
      }
    });

  if (messages.hasMessages()) {
    Console.stderr.write(messages.formatMessages());
    return 1;
  }

  Console.stdout.write('Bundling source...\n');

  var sources = _.union(compileResult.sources, testFiles);

  // Send the versions lock file over to the server! We should make sure to use
  // the same version lock file when we build this source elsewhere (ex:
  // publish-for-arch).
  // But see also #PackageVersionFilesHack
  var versionsFile = packageSource.versionsFilePath();
  if (versionsFile &&  fs.existsSync(versionsFile)) {
    sources.push("versions.json");
  }
  var sourceBundleResult = bundleSource(
    compileResult.unipackage, sources, packageSource.sourceRoot);

  // Create the package. Check that the metadata exists.
  if (options.new) {
    Console.stdout.write('Creating package...\n');
    try {
      var packageId = exports.callPackageServer(conn,
        'createPackage', {
            name: packageSource.name
        });
    } catch (err) {
      Console.stderr.write(err.message + "\n");
      return 3;
    }

  }

  if (options.existingVersion) {
    var existingRecord = catalog.official.getVersion(name, version);
    if (!existingRecord) {
      Console.stderr.write("Version does not exist.\n");
      return 1;
    }
    if (existingRecord.source.treeHash !== sourceBundleResult.treeHash) {
      Console.stderr.write(
        "Package source differs from the existing version.\n");
      return 1;
    }

    // XXX check that we're actually providing something new?
  } else {
    Console.stdout.write('Creating package version...\n');

    var uploadRec = {
      packageName: packageSource.name,
      version: version,
      description: packageSource.metadata.summary,
      git: packageSource.metadata.git,
      earliestCompatibleVersion: packageSource.earliestCompatibleVersion,
      compilerVersion: compiler.BUILT_BY,
      containsPlugins: packageSource.containsPlugins(),
      dependencies: packageDeps
    };
    try {
      var uploadInfo = exports.callPackageServer(conn,
        'createPackageVersion', uploadRec);
    } catch (err) {
      Console.stderr.write("ERROR " + err.message + "\n");
      return 3;
    }

    // XXX If package version already exists, print a nice error message
    // telling them to try 'meteor publish-for-arch' if they want to
    // publish a new build.

    Console.stdout.write('Uploading source...\n');
    uploadTarball(uploadInfo.uploadUrl, sourceBundleResult.sourceTarball);

    Console.stdout.write('Publishing package version...\n');
    try {
      exports.callPackageServer(conn,
                        'publishPackageVersion',
                        uploadInfo.uploadToken,
                        { tarballHash: sourceBundleResult.tarballHash,
                          treeHash: sourceBundleResult.treeHash });
    } catch (err) {
      Console.stderr.write("ERROR " + err.message + "\n");
      return 3;
    }

  }

  createAndPublishBuiltPackage(conn, compileResult.unipackage);

  return 0;
};

// Call the server to ask if we are authorized to update this release or
// package. This is a way to save time before sending data to the server. It
// will mostly ignore most errors (just in case we have a flaky network connection or
// something) and let the method deal with those.
//
// If this returns FALSE, then we are NOT authorized.
// Otherwise, return true.
exports.amIAuthorized = function (name, conn, isRelease) {
  var methodName = "amIAuthorized" +
    (isRelease ? "Release" : "Package");

  try {
    exports.callPackageServer(conn, methodName, name);
  } catch (err) {
    if (err.error === 401) {
      return false;
    }

    // We don't know what this error is. Probably we can't contact the server,
    // or the like. It would be a pity to fail all operations with the server
    // just because a preliminary check fails, so return true for now.
    return true;
  }
  return true;
};
