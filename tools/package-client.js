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
var packageVersionParser = require('./package-version-parser.js');
var authClient = require('./auth-client.js');
var catalog = require('./catalog.js');
var projectContextModule = require('./project-context.js');

// Opens a DDP connection to a package server. Loads the packages needed for a
// DDP connection, then calls DDP connect to the package server URL in config,
// using a current user-agent header composed by http-helpers.js.
var openPackageServerConnection = function (packageServerUrl) {
  var serverUrl = packageServerUrl || config.getPackageServerUrl();
  return authClient.openServiceConnection(serverUrl);
};

// Given a connection, makes a call to the package server.  (Checks to see if
// the connection is connected, and reconnects if needed -- a workaround for
// the fact that connections in the tool do not reconnect)
exports.callPackageServer = function (conn) {
  // XXX This is broken since it doesn't actually replace the conn in the
  // caller, so it'll happen on every subsequent call
  if (!conn.connected) {
    conn.close();
    conn = exports.loggedInPackagesConnection();
  }
  var args = _.values(arguments)
        .slice(1, arguments.length);
  return conn.call.apply(conn, args);
};

var callPackageServerBM = exports.callPackageServerBM = function () {
  buildmessage.assertInJob();
  try {
    return exports.callPackageServer.apply(null, arguments);
  } catch (e) {
    buildmessage.error(e.reason || e.message);
    return null;
  }
};

// Requests and returns one page of new package data that we haven't cached on
// disk. We assume that data is cached chronologically, so essentially, we are
// asking for a diff from the last time that we did this.
// Takes in:
// - conn: the connection to use (does not have to be logged in)
// - syncToken: a syncToken object to be sent to the server that
//   represents the last time that we talked to the server.
// - options:
//    - useShortPages (Boolean). Ask the server for pages of ~3 records
//      instead of ~100, for testing pagination.
//
// Returns an object, containing the following fields:
//  - syncToken: a new syncToken object, that we can pass to the server in the future.
//  - collections: an object keyed by the name of server collections, with the
//    records as an array of javascript objects.
var loadRemotePackageData = function (conn, syncToken, options) {
  options = options || {};

  // Did we get disconnected between retries somehow? Then we should open a new
  // connection. We shouldn't use the callPackageServer method here though,
  // since we don't need to authenticate.
  if (!conn.connected) {
    conn.close();
    conn =  openPackageServerConnection();
  }

  var syncOpts = {};
  if (options && options.useShortPages) {
    syncOpts.shortPagesForTest = options.useShortPages;
  }
  if (options && options.compressCollections) {
    syncOpts.compressCollections = options.compressCollections;
  }
  return conn.call('syncNewPackageData', syncToken, syncOpts);
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
  return buildmessage.enterJob({ title: 'Updating package catalog' }, function () {
    return _updateServerPackageData(dataStore, options);
  });
};

var _updateServerPackageData = function (dataStore, options) {
  var self = this;
  options = options || {};
  if (dataStore === null)
    throw Error("Data store expected");

  var done = false;
  var ret = {resetData: false};

  // For now, we don't have a great progress metric, so just use a spinner
  var useProgressbar = false;

  var start = undefined;
  // Guess that we're about an hour behind, as an opening guess
  var state = { current: 0, end: 60 * 60 * 1000, done: false};
  useProgressbar && buildmessage.reportProgress(state);

  var conn = openPackageServerConnection(options.packageServerUrl);

  // Provide some progress indication for connection
  // XXX though it is just a hack
  state.current = 1;
  useProgressbar && buildmessage.reportProgress(state);

  var getSomeData = function () {
    var syncToken = dataStore.getSyncToken() || {format: "1.1"};

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
    useProgressbar && buildmessage.reportProgress(state);

    var compress = !!process.env.METEOR_CATALOG_COMPRESS_RPCS;

    // (loadRemotePackageData may throw)
    var remoteData = loadRemotePackageData(conn, syncToken, {
      useShortPages: options.useShortPages,
      compressCollections: compress
    });

    // Is the remote server telling us to ignore everything we've heard before?
    // OK, we can do that.
    if (remoteData.resetData) {
      dataStore.reset();
      // The caller may want to take this as a cue to delete packages from the
      // tropohouse.
      ret.resetData = true;
    }

    if (remoteData.collectionsCompressed) {
      var zlib = require('zlib');
      var colsGzippedBuffer = new Buffer(
        remoteData.collectionsCompressed, 'base64');
      var fut = new Future;
      zlib.gunzip(colsGzippedBuffer, fut.resolver());
      var colsJSON = fut.wait();
      remoteData.collections = JSON.parse(colsJSON);
      delete remoteData.collectionsCompressed;
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

  return ret;
};

// Returns a logged-in DDP connection to the package server, or null if
// we cannot log in. If an error unrelated to login occurs
// (e.g. connection to package server times out), then it will be
// thrown.
exports.loggedInPackagesConnection = function () {
  return authClient.loggedInConnection(
    config.getPackageServerUrl(),
    config.getPackageServerDomain(),
    "package-server"
  );
};

// XXX this is missing a few things. In retrospect a better approach here might
//     be to actually make "save source somewhere else" or perhaps "add source
//     to tarball" be part of the package build itself...
var bundleSource = function (isopack, includeSources, packageDir,
                             pluginProviderPackageMap) {
  buildmessage.assertInJob();

  var name = isopack.name;

  var tempDir = files.mkdtemp('build-source-package-');
  var packageTarName = name + '-' + isopack.version + '-source';
  var dirToTar = path.join(tempDir, 'source', packageTarName);
  // XXX name probably needs to be escaped for windows?
  // XXX note that publish-for-arch thinks it knows how this tarball is laid
  //     out, which is a bit of a shame
  var sourcePackageDir = path.join(dirToTar, name);
  if (! files.mkdir_p(sourcePackageDir)) {
    buildmessage.error('Failed to create temporary source directory: ' +
                       sourcePackageDir);
    return null;
  }

  // We copy source files into a temp directory and then tar up the temp
  // directory. It would be great if we could avoid the copy, but as far
  // as we can tell, this is the only way to get a tarball with the
  // directory structure that we want (<package name>-<version-source/
  // at the top level).
  _.each(includeSources, function (f) {
    files.copyFile(path.join(packageDir, f),
                   path.join(sourcePackageDir, f));
  });

  // Write a package map to `.versions` inside the source tarball.  Note that
  // this differs in two ways from the `.versions` file that is maintained
  // inside standalone packages by 'meteor publish':
  //  (a) It only contains the direct, directly implied, and linked-into-plugin
  //      dependencies of the package, not all transitive dependencies.
  //  (b) It is ALWAYS put into the source tarball, even if the package came
  //      from inside an app, whereas the package-source-tree .versions file
  //      is only used for standalone packages
  var packageMapFilename = path.join(sourcePackageDir, '.versions');
  if (fs.existsSync(packageMapFilename))
    throw Error(".versions file already exists? " + packageMapFilename);
  var packageMapFile = new projectContextModule.PackageMapFile({
    filename: packageMapFilename
  });
  packageMapFile.write(pluginProviderPackageMap);

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
      bodyStream: rs,
      bodyStreamLength: size
    });
  } finally {
    rs.close();
  }
};

exports.uploadTarball = uploadTarball;

var bundleBuild = function (isopack) {
  buildmessage.assertInJob();

  var tempDir = files.mkdtemp('build-package-');
  var packageTarName = isopack.tarballName();
  var tarInputDir = path.join(tempDir, packageTarName);

  // Note that we do need to do this even though we already have the isopack on
  // disk in an IsopackCache, because we don't want to include
  // isopack-buildinfo.json. (We don't include it because we're not passing
  // includeIsopackBuildInfo to saveToPath here.)
  isopack.saveToPath(tarInputDir);

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

var createAndPublishBuiltPackage = function (conn, isopack) {
  buildmessage.assertInJob();

  // Note: we really want to do this before createPackageBuild, because the URL
  // we get from createPackageBuild will expire!
  var bundleResult;
  buildmessage.enterJob("bundling build", function () {
    bundleResult = bundleBuild(isopack);
  });
  if (buildmessage.jobHasMessages())
    return;

  var uploadInfo;
  buildmessage.enterJob('creating package build', function () {
    uploadInfo = callPackageServerBM(conn, 'createPackageBuild', {
      packageName: isopack.name,
      version: isopack.version,
      buildArchitectures: isopack.buildArchitectures()
    });
  });
  if (buildmessage.jobHasMessages())
    return;

  buildmessage.enterJob("uploading build", function () {
    uploadTarball(uploadInfo.uploadUrl,
                  bundleResult.buildTarball);
  });
  if (buildmessage.jobHasMessages())
    return;

  buildmessage.enterJob('publishing package build', function () {
    callPackageServerBM(conn, 'publishPackageBuild',
                        uploadInfo.uploadToken,
                        bundleResult.tarballHash,
                        bundleResult.treeHash);
  });
  if (buildmessage.jobHasMessages())
    return;
};

exports.createAndPublishBuiltPackage = createAndPublishBuiltPackage;

// Handle an error thrown on trying to connect to the package server.
exports.handlePackageServerConnectionError = function (error) {
  authClient.handleConnectionError(error, "package server");
};

// Publish the package information into the server catalog. Create new records
// for the package (if needed), the version and the build; upload source and
// isopack.
//
// options:
// - packageSource: the packageSource for this package.
// - connection: the open, logged-in connection over which we should talk to the
//   package server. DO NOT CLOSE this connection here.
// - projectContext: the (probably temporary) ProjectContext to use. Must have\
//   already built local packages
// - new: this package is new, we should call createPackage to create a new
//   package record.
// - existingVersion: we expect the version to exist already, and for us
//   to merely be providing a new build of the same source
// - doNotPublishBuild: do not publish the build of this package.
//
// Return true on success and an error code otherwise.
exports.publishPackage = function (options) {
  buildmessage.assertInJob();
  var packageSource = options.packageSource;
  var conn = options.connection;
  var projectContext = options.projectContext;

  var name = packageSource.name;
  var version = packageSource.version;

  if (options.new && options.existingVersion)
    throw Error("is it new or does it exist?!?");

  // Check that the package name is valid.
  utils.validatePackageName(name, { useBuildmessage: true });
  if (buildmessage.jobHasMessages())
    return;

  // Check that we have a version.
  if (! version) {
    buildmessage.error(
      "Package cannot be published because it doesn't have a version");
    return;
  }

  // Check that the version description is under the character limit. (We check
  // all string limits on the server, but this is the one that is mostly likely
  // to be wrong)
  if (! packageSource.metadata.summary) {
    buildmessage.error(
      "Please describe what your package does. Set a summary " +
        "in Package.describe in package.js.");
    return;
  }

  if (packageSource.metadata.summary.length > 100) {
    buildmessage.error("Summary must be under 100 chars.");
    return;
  }

  // Check that we are an authorized maintainer of this package.
  if (!options['new']) {
    var packRecord = catalog.official.getPackage(name);
    if (! packRecord) {
      buildmessage.error(
        'There is no package named ' + name +
          '. If you are creating a new package, use the --create flag.');
      return;
    }

    if (!exports.amIAuthorized(name, conn, false)) {
      buildmessage.error(
        'You are not an authorized maintainer of ' + name + '.  Only ' +
          'authorized maintainers may publish new versions.');
    }
  }

  // Check that the package does not have any unconstrained references.
  var packageDeps = packageSource.getDependencyMetadata();
  _.each(packageDeps, function(refs, label) {
    if (refs.constraint == null) {
      if (packageSource.isCore && files.inCheckout() &&
          projectContext.localCatalog.getPackage(label)) {
        // Core package is using or implying another core package,
        // without a version number.  We fill in the version number.
        // (Well, we're assuming that the other package is core and
        // not some other sort of local package.)
        var versionString =
              projectContext.localCatalog.getLatestVersion(label).version;
        // modify the constraint on this dep that will be sent to troposphere
        refs.constraint = versionString;
      } else if (label === "meteor") {
        // HACK: We are willing to publish a package with a "null"
        // constraint on the "meteor" package to troposphere.  This
        // happens for non-core packages when not running from a
        // checkout, because all packages implicitly depend on the
        // "meteor" package, but do not necessarily specify an
        // explicit version for it, and we don't have a great way to
        // choose one here.
        // XXX come back to this, especially if we are incrementing the
        // major version of "meteor".  hopefully we will have more data
        // about the package system by then.
      } else {
        buildmessage.error(
          "You must specify a version constraint for package " + label);
      }
    }
  });
  if (buildmessage.jobHasMessages())
    return;

  var isopack = projectContext.isopackCache.getIsopack(name);
  if (! isopack)
    throw Error("no isopack " + name);

  var sourceFiles = isopack.getSourceFilesUnderSourceRoot(
    packageSource.sourceRoot);
  if (! sourceFiles)
    throw Error("isopack doesn't know what its source files are?");

  // We need to have built the test package to get all of its sources, even
  // though we're not publishing a BUILD for the test package.
  if (packageSource.testName) {
    var testIsopack = projectContext.isopackCache.getIsopack(
      packageSource.testName);
    if (! testIsopack)
      throw Error("no testIsopack " + packageSource.testName);
    var testSourceFiles = testIsopack.getSourceFilesUnderSourceRoot(
      packageSource.sourceRoot);
    if (! testSourceFiles)
      throw Error("test isopack doesn't know what its source files are?");
    sourceFiles = _.union(sourceFiles, testSourceFiles);
  }

  // Find the PackageMap of packages that are build time dependencies of this
  // package.
  var pluginProviderPackageMap =
        projectContext.isopackCache.getPluginProviderPackageMap(name);
  if (! pluginProviderPackageMap)
    throw Error("missing pluginProviderPackageMap for " + name);

  var sourceBundleResult;
  buildmessage.enterJob("bundling source", function () {
    sourceBundleResult = bundleSource(
      isopack, sourceFiles, packageSource.sourceRoot, pluginProviderPackageMap);
  });
  if (buildmessage.jobHasMessages())
    return;

  // Create the package. Check that the metadata exists.
  if (options.new) {
    buildmessage.enterJob("creating package", function () {
      callPackageServerBM(conn, 'createPackage', {
        name: packageSource.name
      });
    });
    if (buildmessage.jobHasMessages())
      return;
  }

  if (options.existingVersion) {
    var existingRecord = catalog.official.getVersion(name, version);
    if (! existingRecord) {
      buildmessage.error("Version does not exist.");
      return;
    }
    if (existingRecord.source.treeHash !== sourceBundleResult.treeHash) {
      buildmessage.error("Package source differs from the existing version.");
      return;
    }

    // XXX check that we're actually providing something new?
  } else {
    var uploadInfo;
    buildmessage.enterJob("creating package version", function () {
      var uploadRec = {
        packageName: packageSource.name,
        version: version,
        description: packageSource.metadata.summary,
        git: packageSource.metadata.git,
        compilerVersion: compiler.BUILT_BY,
        containsPlugins: packageSource.containsPlugins(),
        debugOnly: packageSource.debugOnly,
        releaseName: release.current.name,
        dependencies: packageDeps
      };
      uploadInfo = callPackageServerBM(conn, 'createPackageVersion', uploadRec);
    });
    if (buildmessage.jobHasMessages())
      return;

    // XXX If package version already exists, print a nice error message
    // telling them to try 'meteor publish-for-arch' if they want to
    // publish a new build.

    buildmessage.enterJob("uploading source", function () {
      uploadTarball(uploadInfo.uploadUrl, sourceBundleResult.sourceTarball);
    });
    if (buildmessage.jobHasMessages())
      return;

    buildmessage.enterJob("publishing package version", function () {
      callPackageServerBM(conn, 'publishPackageVersion',
                          uploadInfo.uploadToken,
                          { tarballHash: sourceBundleResult.tarballHash,
                            treeHash: sourceBundleResult.treeHash });
    });
    if (buildmessage.jobHasMessages())
      return;
  }

  if (! options.doNotPublishBuild) {
    createAndPublishBuiltPackage(conn, isopack);
    if (buildmessage.jobHasMessages())
      return;
  }

  return;
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
