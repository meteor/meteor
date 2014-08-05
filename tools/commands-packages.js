var main = require('./main.js');
var path = require('path');
var _ = require('underscore');
var fs = require("fs");
var files = require('./files.js');
var deploy = require('./deploy.js');
var buildmessage = require('./buildmessage.js');
var uniload = require('./uniload.js');
var project = require('./project.js').project;
var warehouse = require('./warehouse.js');
var auth = require('./auth.js');
var config = require('./config.js');
var release = require('./release.js');
var Future = require('fibers/future');
var runLog = require('./run-log.js');
var packageClient = require('./package-client.js');
var utils = require('./utils.js');
var httpHelpers = require('./http-helpers.js');
var archinfo = require('./archinfo.js');
var tropohouse = require('./tropohouse.js');
var packageCache = require('./package-cache.js');
var PackageSource = require('./package-source.js');
var compiler = require('./compiler.js');
var catalog = require('./catalog.js');
var stats = require('./stats.js');
var unipackage = require('./unipackage.js');

// Returns an object with keys:
//  record : (a package or version record)
//  release : true if it is a release instead of a package.
var getReleaseOrPackageRecord = function(name) {
  // Too lazy to do string parsing.
  var rec = catalog.official.getPackage(name);
  var rel = false;
  if (!rec) {
    // Not a package! But is it a release track?
    rec = catalog.official.getReleaseTrack(name);
    if (rec)
      rel = true;
  }
  return { record: rec, isRelease: rel };
};

// Returns a pretty list suitable for showing to the user. Input is an
// array of objects with keys 'name' and 'description'.
var formatList = function (items) {
  var longest = '';
  _.each(items, function (item) {
    if (item.name.length > longest.length)
      longest = item.name;
  });

  var pad = longest.replace(/./g, ' ');
  // it'd be nice to read the actual terminal width, but I tried
  // several methods and none of them work (COLUMNS isn't set in
  // node's environment; `tput cols` returns a constant 80). maybe
  // node is doing something weird with ptys.
  var width = 80;

  var out = '';
  _.each(items, function (item) {
    var name = item.name + pad.substr(item.name.length);
    var description = item.description || 'No description';
    out += (name + "  " +
            description.substr(0, width - 2 - pad.length) + "\n");
  });

  return out;
};


///////////////////////////////////////////////////////////////////////////////
// publish a package
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'publish',
  minArgs: 0,
  maxArgs: 0,
  options: {
    create: { type: Boolean },
    // This is similar to publish-for-arch, but uses the source code you have
    // locally (and other local packages you may have) instead of downloading
    // the source bundle. It does verify that the source is the same, though.
    // Good for bootstrapping things in the core release.
    'existing-version': { type: Boolean }
  },
  requiresPackage: true
}, function (options) {
  if (options.create && options['existing-version']) {
    // Make up your mind!
    process.stderr.write("The --create and --existing-version options cannot " +
                         "both be specified.\n");
    return 1;
  }

  // Refresh the catalog, caching the remote package data on the server. We can
  // optimize the workflow by using this data to weed out obviously incorrect
  // submissions before they ever hit the wire.
  catalog.official.refresh();
  var packageName = path.basename(options.packageDir);

  // Fail early if the package already exists.
  if (options.create) {
    if (catalog.official.getPackage(packageName)) {
      process.stderr.write("Package already exists. To create a new version of an existing "+
                           "package, do not use the --create flag! \n");
      return 2;
    }
  };

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  if (! conn) {
    process.stderr.write('No connection: Publish failed.\n');
    return 1;
  }

  process.stdout.write('Building package...\n');

  // XXX Prettify error messages

  var packageSource, compileResult;
  var messages = buildmessage.capture(
    { title: "building the package" },
    function () {

      if (! utils.validPackageName(packageName)) {
        buildmessage.error("Invalid package name:", packageName);
      }

      packageSource = new PackageSource;

      // Anything published to the server must have a version.
      packageSource.initFromPackageDir(packageName, options.packageDir, {
        requireVersion: true });
      if (buildmessage.jobHasMessages())
        return; // already have errors, so skip the build

      var directDeps =
            compiler.determineBuildTimeDependencies(packageSource).directDependencies;
      project._ensurePackagesExistOnDisk(directDeps);

      compileResult = compiler.compile(packageSource, { officialBuild: true });
    });

  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }

  // We have initialized everything, so perform the publish oepration.
  var ec;  // XXX maybe combine with messages?
  messages = buildmessage.capture({
    title: "publishing the package"
  }, function () {
    ec = packageClient.publishPackage(
      packageSource, compileResult, conn, {
        new: options.create,
        existingVersion: options['existing-version']
      });
  });
  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return ec || 1;
  }

  // Warn the user if their package is not good for all architectures.
  var allArchs = compileResult.unipackage.buildArchitectures().split('+');
  if (_.any(allArchs, function (arch) {
    return arch.match(/^os\./);
  })) {
    process.stdout.write(
      "\nWARNING: Your package contains binary code and is only compatible with " +
       archinfo.host() + " architecture.\n" +
       "Please use publish-for-arch to publish new builds of the package.\n\n");
  }

  // We are only publishing one package, so we should close the connection, and
  // then exit with the previous error code.
  conn.close();

  catalog.official.refresh();

  return ec;
});


main.registerCommand({
  name: 'publish-for-arch',
  minArgs: 1,
  maxArgs: 1
}, function (options) {

  // argument processing
  var all = options.args[0].split('@');
  if (all.length !== 2) {
    process.stderr.write(
      'Incorrect argument. Please use the form of <packageName>@<version>\n');
    throw new main.ShowUsage;
  }
  var name = all[0];
  var versionString = all[1];

  // Refresh the catalog, cacheing the remote package data on the server.
  catalog.official.refresh(true);

  if (! catalog.complete.getPackage(name)) {
    process.stderr.write(
"You can't call `meteor publish-for-arch` on package '" + name + "' without\n" +
"publishing it first.\n\n" +
"To publish the package, run `meteor publish --create` from the package directory.\n\n");

    return 1;
  }
  var pkgVersion = catalog.official.getVersion(name, versionString);
  if (! pkgVersion) {
    process.stderr.write(
"You can't call `meteor publish-for-arch` on version " + versionString + " of\n" +
"package '" + name + "' without publishing it first.\n\n" +
"To publish the version, run `meteor publish` from the package directory.\n\n");

    return 1;
  }

  if (! pkgVersion.source || ! pkgVersion.source.url) {
    process.stderr.write('There is no source uploaded for ' +
                         name + '@' + versionString + "\n");
    return 1;
  }

  var sourceTarball = httpHelpers.getUrl({
    url: pkgVersion.source.url,
    encoding: null
  });
  var sourcePath = files.mkdtemp(name + '-' +
                                 versionString + '-source-');
  // XXX check tarballHash!
  files.extractTarGz(sourceTarball, sourcePath);

  // XXX Factor out with packageClient.bundleSource so that we don't
  // have knowledge of the tarball structure in two places.
  var packageDir = path.join(sourcePath, name);

  if (! fs.existsSync(packageDir)) {
    process.stderr.write('Malformed source tarball\n');
    return 1;
  }

  var unipkg;
  var messages = buildmessage.capture({
    title: "building package " + name
  }, function () {
    var packageSource = new PackageSource;

    // This package source, although it is initialized from a directory is
    // immutable. It should be built exactly as is. If we need to modify
    // anything, such as the version lock file, something has gone terribly
    // wrong and we should throw.
    packageSource.initFromPackageDir(name, packageDir,  {
      requireVersion: true,
      immutable: true
    });
    if (buildmessage.jobHasMessages())
      return;

    unipkg = compiler.compile(packageSource, {
      officialBuild: true
    }).unipackage;
    if (buildmessage.jobHasMessages())
      return;
  });

  if (messages.hasMessages()) {
    process.stderr.write("\n" + messages.formatMessages());
    return 1;
  }

  var conn;
  try {
    conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  messages = buildmessage.capture({
    title: "publishing package " + name
  }, function () {
    packageClient.createAndPublishBuiltPackage(conn, unipkg);
  });

  if (messages.hasMessages()) {
    process.stderr.write("\n" + messages.formatMessages());
    return 1;
  }

  catalog.official.refresh();  // XXX buildmessage.capture?
  return 0;
});

main.registerCommand({
  name: 'publish-release',
  minArgs: 1,
  maxArgs: 1,
  options: {
    'create-track': { type: Boolean, required: false },
    'from-checkout': { type: Boolean, required: false }
  }
}, function (options) {
  // Refresh the catalog, cacheing the remote package data on the server.
  process.stdout.write("Resyncing with package server...\n");
  catalog.official.refresh();

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  var relConf = {};

  // Let's read the json release file. It should, at the very minimum contain
  // the release track name, the release version and some short freeform
  // description.
  try {
    var data = fs.readFileSync(options.args[0], 'utf8');
    relConf = JSON.parse(data);
  } catch (e) {
    process.stderr.write("Could not parse release file: ");
    process.stderr.write(e.message + "\n");
    return 1;
  }

  // Fill in the order key and any other generated release.json fields.
  process.stdout.write("Double-checking release schema .");

  // Check that the schema is valid -- release.json contains all the required
  // fields, does not contain contradicting information, etc. Output all
  // messages, so the user can fix all errors at once.
  // XXX: Check for unknown keys.
  var badSchema = false;
  var bad = function (message) {
    if (!badSchema)
      process.stderr.write("\n");
    process.stderr.write(message + "\n");
    badSchema = true;
  };
  if (!_.has(relConf, 'track')) {
    bad("Configuration file must specify release track. (track).");
  }
  if (!_.has(relConf, 'version')) {
    bad("Configuration file must specify release version. (version).");
  }
  if (!_.has(relConf, 'description')) {
    bad("Configuration file must contain a description (description).");
  } else if (relConf['description'].length > 100) {
    bad("Description must be under 100 characters.");
  }
  if (!options['from-checkout']) {
    if (!_.has(relConf, 'tool')) {
      bad("Configuration file must specify a tool version (tool) unless in --from-checkout mode.");
    }
    if (!_.has(relConf, 'packages')) {
      bad("Configuration file must specify package versions (packages) unless in --from-checkout mode.");
    }
  }

  // If you didn't specify an orderKey and it's compatible with our conventional
  // orderKey generation algorithm, use the algorithm. If you explicitly specify
  // orderKey: null, don't include one.
  if (!_.has(relConf, 'orderKey')) {
    relConf.orderKey = utils.defaultOrderKeyForReleaseVersion(relConf.version);
  }
  // This covers both the case of "explicitly specified {orderKey: null}" and
  // "defaultOrderKeyForReleaseVersion returned null".
  if (relConf.orderKey === null) {
    delete relConf.orderKey;
  }

  if (!_.has(relConf, 'orderKey') && relConf['recommended']) {
    bad("Recommended releases must have order keys.");
  }
  // On the main release track, we can't name the release anything beginning
  // with 0.8 and below, because those are taken for pre-troposphere releases.
  if ((relConf.track === catalog.official.DEFAULT_TRACK)) {
    var start = relConf.version.slice(0,4);
    if (start === "0.8." || start === "0.7." ||
        start === "0.6." || start === "0.5.") {
      bad(
        "It looks like you are trying to publish a pre-package-server meteor release.\n" +
          "Doing this through the package server is going to cause a lot of confusion.\n" +
          "Please use the old release process.");
    }
  }
  if (badSchema) {
    return 1;
  }
  process.stdout.write(".");

  // Let's check if this is a known release track/ a track to which we are
  // authorized to publish before we do any complicated/long operations, and
  // before we publish its packages.
  if (!options['create-track']) {
    var trackRecord = catalog.official.getReleaseTrack(relConf.track);
    if (!trackRecord) {
      process.stderr.write('\n There is no release track named ' + relConf.track +
                           '. If you are creating a new track, use the --create-track flag.\n');
      return 1;
    }

    // We are going to call the server to check if we are authorized, so that when
    // we implement things like organizations, we are not handicapped by the
    // user's meteor version.
    if (!packageClient.amIAuthorized(relConf.track,conn,  true)) {
      process.stderr.write('\n You are not an authorized maintainer of ' + relConf.track + ".\n");
      process.stderr.write('Only authorized maintainers may publish new versions.\n');
      return 1;
    };
  }

  process.stdout.write(". OK!\n");

  // This is sort of a hidden option to just take your entire meteor checkout
  // and make a release out of it. That's what we do now (that's what releases
  // meant pre-0.90), and it is very convenient to do that here.
  //
  // If you have any unpublished packages at new versions in your checkout, this
  // WILL PUBLISH THEM at specified versions. (If you have unpublished changes,
  // including changes to build-time dependencies, but have not incremented the
  // version number, this will use buildmessage to error and exit.)
  //
  // Without any modifications about forks and package names, this particular
  // option is not very useful outside of MDG. Right now, to run this option on
  // a non-MDG fork of meteor, someone would probably need to go through and
  // change the package names to have proper prefixes, etc.
  if (options['from-checkout']) {
    // You must be running from checkout to bundle up your checkout as a release.
    if (!files.inCheckout()) {
      process.stderr.write("Must run from checkout to make release from checkout.\n");
      return 1;
    };

    // We are going to disable publishing a release from checkout and an appDir,
    // just to be extra safe about local packages. There is never a good reason
    // why you would do that, and maybe you are confused about what you are
    // trying to do.
    if (options.appDir) {
      process.stderr.write("Trying to publish from checkout while in an application " +
                           "directory is a bad idea." +
                           " Please try again from somewhere else.\n");
      return 1;
    }

    // You should not use a release configuration with packages&tool *and* a
    // from checkout option, at least for now. That's potentially confusing
    // (which ones did you mean to use) and makes it likely that you did one of
    // these by accident. So, we will disallow it for now.
    if (relConf.packages || relConf.tool) {
      process.stderr.write(
        "Setting the --from-checkout option will use the tool and packages in your meteor " +
        "checkout.\n" +
        "Your release configuration file should not contain that information.\n");
      return 1;
    }

    // Now, let's collect all the packages in our meteor/packages directory. We
    // are going to be extra-careful to publish only those packages, and not
    // just all local packages -- we might be running this from an app
    // directory, though we really shouldn't be, or, if we ever restructure the
    // way that we store packages in the meteor directory, we should be sure to
    // reevaluate what this command actually does.
    var localPackageDir = path.join(files.getCurrentToolsDir(), "packages");
    var contents = fs.readdirSync(localPackageDir);
    var myPackages = {};
    var toPublish = {};
    var canBuild = true;
    var messages = buildmessage.capture(
      {title: "rebuilding local packages"},
      function () {
        process.stdout.write("Rebuilding local packages...\n");
        _.each(contents, function (item) {
          // We expect the meteor/packages directory to only contain a lot of
          // directories, each of which is a package. This may one day be false,
          // in which case, this function will fail. That's an extra layer of
          // safety -- this is a very specific command that does a very specific
          // thing, and if we ever change how we store packages in checkout, we
          // should reconsider if, for example, we want to publish all of them
          // in a release.
          var packageDir = path.resolve(path.join(localPackageDir, item));
          // Consider a directory to be a package source tree if it
          // contains 'package.js'. (We used to support unipackages in
          // localPackageDirs, but no longer.)
          if (fs.existsSync(path.join(packageDir, 'package.js'))) {
            var packageSource = new PackageSource;
            buildmessage.enterJob(
              { title: "building package " + item },
              function () {
                process.stdout.write("  checking consistency of " + item + " ");

                // Initialize the package source. (If we can't do this, then we should
                // not proceed)
                packageSource.initFromPackageDir(item, packageDir,  {
                  requireVersion: true });

                if (buildmessage.jobHasMessages()) {
                  process.stderr.write("\n ...Error reading package:" + item + "\n");
                  canBuild = false;
                  return;
                };

                // We are not very good with change detection on the meteor
                // tool, so we should just make extra-special sure to rebuild it
                // completely before publishing. Though we don't really need this.
                if (packageSource.includeTool) {
                  // Remove the build directory.
                  files.rm_recursive(
                    path.join(packageSource.sourceRoot, '.build.' + item));
                }

                process.stdout.write(".");

                // Now compile it! Once again, everything should compile, and if
                // it doesn't we should fail. Hopefully, of course, we have
                // tested our stuff before deciding to publish it to the package
                // server, but we need to be careful.
                var directDeps =
                      compiler.determineBuildTimeDependencies(packageSource).directDependencies;
                project._ensurePackagesExistOnDisk(directDeps);
                var compileResult = compiler.compile(packageSource,
                                                     { officialBuild: true });
                if (buildmessage.jobHasMessages()) {
                  process.stderr.write("\n ... Error compiling unipackage: " + item + "\n");
                  canBuild = false;
                  return;
                };
                process.stdout.write(".");

                // Let's get the server version that this local package is
                // overwriting. If such a version exists, we will need to make sure
                // that the contents are the same.
                var oldVersion = catalog.official.getVersion
                                   (item, packageSource.version);

                // Include this package in our release.
                myPackages[item] = packageSource.version;
                process.stdout.write(".");

                // If there is no old version, then we need to publish this package.
                if (!oldVersion) {
                  // We are going to check if we are publishing an official
                  // release. If this is an experimental or pre-release, then we
                  // are not ready to commit to these package semver versions
                  // either. Any packages that we should publish as part of this
                  // release should have a -(something) at the end.
                  var newVersion = packageSource.version;
                  if (!relConf.official && newVersion.split("-").length < 2) {
                    buildmessage.error("It looks like you are building an "+
                                       " experimental or pre-release. Any packages " +
                                       "we publish here should have an identifier " +
                                       "at the end (ex: 1.0.0-dev). If this is an " +
                                       "official release, please set official to true " +
                                       "in the release configuration file.");
                    return;
                  }
                  toPublish[item] = {source: packageSource,
                                     compileResult: compileResult};
                  process.stdout.write("new package or version\n");
                  return;
                } else {
                  // If we can't build some of our packages, then we care about
                  // that far more than we care about hash conflicts (and fixing
                  // the errors will change the hashes as well). Don't even
                  // bother checking until that happens.
                  if (!canBuild) {
                    process.stdout.write("hash comparison skipped\n");
                    return;
                  }

                  var existingBuild =
                        catalog.official.getBuildWithPreciseBuildArchitectures(
                          oldVersion,
                          compileResult.unipackage.buildArchitectures());

                  // If the version number mentioned in package.js exists, but
                  // there's no build of this architecture, then either the old
                  // version was only semi-published, or you've added some
                  // platform-specific dependencies but haven't bumped the
                  // version number yet; either way, you should probably bump
                  // the version number.
                  var somethingChanged = !existingBuild;

                  if (!somethingChanged) {
                    // Save the unipackage, just to get its hash.
                    // XXX this is redundant with the bundle build step that
                    // publishPackage will do later
                    var bundleBuildResult = packageClient.bundleBuild(
                      compileResult.unipackage);
                    if (bundleBuildResult.treeHash !==
                        existingBuild.build.treeHash) {
                      somethingChanged = true;
                    }
                  }

                  if (somethingChanged) {
                    // The build ID of the old server record is not the same as
                    // the buildID that we have on disk. This means something
                    // has changed -- maybe our source files, or a buildId of
                    // one of our build-time dependencies. There might be a
                    // false positive here (for example, we added some comments
                    // to a package.js file somewhere), but, for now, we would
                    // rather err on the side of catching this issue and forcing
                    // a more thorough check.
                    buildmessage.error("Something changed in package " + item
                                       + ". Please upgrade version number.");
                    process.stderr.write("NOT OK\n");
                  } else {
                    process.stdout.write("ok\n");
                  }
                }
              });
          }
        });
      });

    if (messages.hasMessages()) {
      process.stderr.write("\n" + messages.formatMessages());
      return 1;
    };

    // We now have an object of packages that have new versions on disk that
    // don't exist in the server catalog. Publish them.
    for (var name in toPublish) {  // don't use _.each so we can return
      if (!_.has(toPublish, name))
        continue;
      var prebuilt = toPublish[name];

      var opts = {
        new: !catalog.official.getPackage(name)
      };
      process.stdout.write("Publishing package: " + name + "\n");

      var pubEC;  // XXX merge with messages?
      messages = buildmessage.capture({
        title: "publishing package " + name
      }, function () {
        // If we are creating a new package, dsPS will document this for us, so
        // we don't need to do this here. Though, in the future, once we are
        // done bootstrapping package servers, we should consider having some
        // extra checks around this.
        pubEC = packageClient.publishPackage(
          prebuilt.source,
          prebuilt.compileResult,
          conn,
          opts);
      });
      if (messages.hasMessages()) {
        process.stderr.write(messages.formatMessages());
        return pubEC || 1;
      }

      // If we fail to publish, just exit outright, something has gone wrong.
      if (pubEC > 0) {
        process.stderr.write("Failed to publish: " + name + "\n");
        return pubEC;
      }
    }

    // Set the remaining release information. For now, when we publish from
    // checkout, we always set the meteor tool as the tool. We don't include the
    // tool in the packages list.
    relConf.tool="meteor-tool@" + myPackages["meteor-tool"];
    delete myPackages["meteor-tool"];
    relConf.packages=myPackages;
  }

  // Create the new track, if we have been told to.
  if (options['create-track']) {
    process.stdout.write("Creating a new release track...\n");
    var track = conn.call('createReleaseTrack',
                         { name: relConf.track } );
  }

  process.stdout.write("Creating a new release version...\n");
    var record = {
      track: relConf.track,
      version: relConf.version,
      orderKey: relConf.orderKey,
      description: relConf.description,
      recommended: !!relConf.recommended,
      tool: relConf.tool,
      packages: relConf.packages
    };

  var uploadInfo;
  try {
    if (!relConf.patchFrom) {
      uploadInfo = conn.call('createReleaseVersion', record);
    } else {
      uploadInfo = conn.call('createPatchReleaseVersion', record, relConf.patchFrom);
    }
  } catch (err) {
    process.stderr.write("ERROR: " + err + "\n");
    return 1;
  }

  // Get it back.
  catalog.official.refresh();
  process.stdout.write("Done creating " + relConf.track  + "@" +
                       relConf.version + "!\n");
  return 0;
});


///////////////////////////////////////////////////////////////////////////////
// search
///////////////////////////////////////////////////////////////////////////////


main.registerCommand({
  name: 'search',
  minArgs: 0,
  maxArgs: 1,
  options: {
    details: { type: Boolean, required: false },
    mine: {type: Boolean, required: false }
  },
}, function (options) {

  if (options.details && options.mine) {
    process.stderr.write("You must select a specific package by name to view details. \n");
    return 1;
  }

  if (!options.mine && options.args.length === 0) {
    process.stderr.write("You must search for packages by name or substring. \n");
    throw new main.ShowUsage;
  }


  catalog.official.refresh();

  if (options.details) {
    var full = options.args[0].split('@');
    var name = full[0];
    var allRecord = getReleaseOrPackageRecord(name);
    var record = allRecord.record;
    if (!record) {
      process.stderr.write("Unknown package or release: " +  name + "\n");
      return 1;
    }
    var versionRecords;
    var label;
    if (!allRecord.isRelease) {
      label = "package";
      var getRelevantRecord = function (version) {
        var versionRecord =
              catalog.official.getVersion(name, version);
        var myBuilds = _.pluck(
          catalog.official.getAllBuilds(name, version),
          'buildArchitectures');
        // Does this package only have a cross-platform build?
        if (myBuilds.length === 1) {
          var allArches = myBuilds[0].split('+');
          if (!_.any(allArches, function (arch) {
            return arch.match(/^os\./);
          })) {
            return versionRecord;
          }
        }
        // This package is only available for some architectures.
        // XXX show in a more human way?
        var myStringBuilds = myBuilds.join(' ');
        return _.extend({ buildArchitectures: myStringBuilds },
                        versionRecord);
      };
      var versions = catalog.official.getSortedVersions(name);
      if (full.length > 1) {
        versions = [full[1]];
      }
      versionRecords = _.map(versions, getRelevantRecord);
    } else {
      label = "release";
      if (full.length > 1) {
        versionRecords = [catalog.official.getReleaseVersion(name, full[1])];
      } else {
        versionRecords =
          _.map(catalog.official.getSortedRecommendedReleaseVersions(name, ""),
                function (v) {
                  return catalog.official.getReleaseVersion(name, v);
                });
      }
    }
    if (_.isEqual(versionRecords, [])) {
      if (allRecord.release) {
        process.stderr.write(
          "No recommended versions of release " + name + " exist.\n");
      } else {
        process.stderr.write("No versions of package" + name + " exist.\n");
      }
    } else {
      var lastVersion = versionRecords[versionRecords.length - 1];
      if (!lastVersion && full.length > 1) {
        process.stderr.write(
          "Unknown version of" + name + ":" + full[1] + "\n");
        return 1;;
      }
      var unknown = "< unknown >";
      _.each(versionRecords, function (v) {
        var versionDesc = "Version " + v.version;
        if (v.description)
          versionDesc = versionDesc + " : " + v.description;
        process.stdout.write(versionDesc + "\n");
        if (v.buildArchitectures && full.length > 1)
          process.stdout.write("      Architectures: "
                           + v.buildArchitectures + "\n");
        if (v.packages && full.length > 1) {
          process.stdout.write("      tool: " + v.tool + "\n");
          process.stdout.write("      packages:" + "\n");

          versionDesc = versionDesc + "\n      packages:\n";
          _.each(v.packages, function(pv, pn) {
             process.stdout.write("          " + pn + ":" + pv + "\n");
          });
        }
      });
      process.stdout.write("\n");
      process.stdout.write("The " + label + " " + name + " : "
                  + lastVersion.description || unknown + "\n");
    }
    var maintain = ". Maintained by " +
          _.pluck(record.maintainers, 'username') + ".";
    if (lastVersion.git) {
      maintain = maintain + " at " + lastVersion.git;
    }
    if (record.homepage) {
      maintain = maintain + "\nYou can find more information at "
          + record.homepage;
    }
    process.stdout.write(maintain + "\n");
  } else {


    var allPackages = catalog.official.getAllPackageNames();
    var allReleases = catalog.official.getAllReleaseTracks();
    var matchingPackages = [];
    var matchingReleases = [];

    var selector;
    if (options.mine) {
      var myUserName = auth.loggedInUsername();
      if (!myUserName) {
        // But couldn't you just grep the data.json for any maintainer? Yeah,
        // but that's temporary, and won't work once organizations are around.
        process.stderr.write("Please login so we know who you are. \n");
        auth.doUsernamePasswordLogin({});
        myUserName = auth.loggedInUsername();
      }
      // In the future, we should consider checking this on the server, but I
      // suspect the main use of this command will be to deal with the automatic
      // migration and uncommon in everyday use. From that perspective, it makes
      // little sense to require you to be online to find out what packages you
      // own; and the consequence of not mentioning your group packages until
      // you update to a new version of meteor is not that dire.
      selector = function (packageName, isRelease) {
        var record;
        if (!isRelease) {
           record = catalog.official.getPackage(packageName);
        } else {
           record = catalog.official.getReleaseTrack(packageName);
        }
        if (_.indexOf(_.pluck(record.maintainers, 'username'), myUserName) !== -1) {
          return true;
        }
        return false;
       };
     } else {
       var search = options.args[0];
       selector = function (packageName) {
         return packageName.match(search);
        };
     }

    _.each(allPackages, function (pack) {
      if (selector(pack, false)) {
        var vr = catalog.official.getLatestVersion(pack);
        if (vr) {
          matchingPackages.push(
            { name: pack, description: vr.description });
        }
      }
    });
    _.each(allReleases, function (track) {
      if (selector(track, true)) {
        var vr = catalog.official.getDefaultReleaseVersion(track);
        if (vr) {
          var vrlong =
                catalog.official.getReleaseVersion(track, vr.version);
          matchingReleases.push(
            { name: track, description: vrlong.description });
        }
      }
    });

    var output = false;
    if (!_.isEqual(matchingPackages, [])) {
      output = true;
      process.stdout.write("Found the following packages:" + "\n");
      process.stdout.write(formatList(matchingPackages) + "\n");
    }

    if (!_.isEqual(matchingReleases, [])) {
      output = true;
      process.stdout.write("Found the following releases:" + "\n");
      process.stdout.write(formatList(matchingReleases) + "\n");
    }

    if (!output) {
      process.stderr.write(
        "Neither packages nor releases containing the string \'" +
        search + "\' could be found.\n");
    } else {
      process.stdout.write(
"To get more information on a specific item, use meteor search --details.\n");
    }

  }
});

///////////////////////////////////////////////////////////////////////////////
// list
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'list',
  requiresApp: true,
  options: {
  }
}, function (options) {
  var items = [];

  var newVersionsAvailable = false;

  var messages = buildmessage.capture(function () {
    // Packages that are used by this app
    var packages = project.getConstraints();
    // Versions of the packages. We need this to get the right description for
    // the user, in case it changed between versions.
    var versions = project.getVersions();

    _.each(packages, function (version, name) {
      if (!version) {
        version = versions[name];
      }
      // Use complete catalog to get the local versions of local packages.
      var versionInfo = catalog.complete.getVersion(name, version);
      if (!versionInfo) {
        buildmessage.error("Cannot process package list. Unknown: " + name +
                           " at version " + version + "\n");
        return;
      }

      var versionAddendum = "" ;
      var latest = catalog.complete.getLatestVersion(name, version);
      if (version !== latest.version &&
          !catalog.complete.isLocalPackage(name)) {
        versionAddendum = "*";
        newVersionsAvailable = true;
      } else {
        versionAddendum = " ";
      }

      var description = version + versionAddendum +
            (versionInfo.description ?
             (": " + versionInfo.description) :
             "");
      items.push({ name: name, description: description });

    });
  });
  if (messages.hasMessages()) {
    process.stderr.write("\n" + messages.formatMessages());
    return 1;
  }

  process.stdout.write(formatList(items));

  if (newVersionsAvailable) {
    process.stdout.write(
      "\n * New versions of these packages are available! " +
        "Run 'meteor update' to update.\n");
  }
  return 0;
});



///////////////////////////////////////////////////////////////////////////////
// update
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'update',
  options: {
    patch: { type: Boolean, required: false },
    "packages-only": { type: Boolean, required: false }
  },
  // We have to be able to work without a release, since 'meteor
  // update' is how you fix apps that don't have a release.
  requiresRelease: false,
  minArgs: 0,
  maxArgs: Infinity
}, function (options) {
  // XXX clean this up if we don't end up using it, but we probably should be
  // using it on the refresh call
  var couldNotContactServer = false;

  // Refresh the catalog, cacheing the remote package data on the server.
  catalog.official.refresh(true);

  // If you are specifying packaging individually, you probably don't want to
  // update the release.
  if (options.args.length > 0) {
    options["packages-only"] = true;
  }

  // Some basic checks to make sure that this command is being used correctly.
  if (options["packages-only"] && options["patch"]) {
    process.stderr.write("There is no such thing as a patch update to packages.");
    return 1;;
  }

  if (!options["packages-only"]) {

    // refuse to update the release if we're in a git checkout.
    if (! files.usesWarehouse()) {
      process.stderr.write(
        "update: can only be run from official releases, not from checkouts\n");
      return 1;
    }

    // This is the release track we'll end up on --- either because it's
    // the explicitly specified (with --release) track; or because we
    // didn't specify a release and it's the app's current release (if we're
    // in an app dir), since non-forced updates don't change the track.
    // XXX better error checking on release.current.name
    // XXX add a method to release.current
    var releaseTrack = release.current.getReleaseTrack();

    // Unless --release was passed (in which case we ought to already have
    // springboarded to that release), go get the latest release and switch to
    // it. (We already know what the latest release is because we refreshed the
    // catalog above.)  Note that after springboarding, we will hit this again
    // (because springboarding to a specific release does NOT set release.forced),
    // but it should be a no-op next time (unless there actually was a new latest
    // release in the interim).
    if (! release.forced) {
      var latestRelease = release.latestDownloaded(releaseTrack);
      // Are we on some track without ANY recommended releases at all,
      // and the user ran 'meteor update' without specifying a release? We
      // really can't do much here.
      if (!latestRelease) {
        // XXX is there a command to get to the latest METEOR-CORE@? Should we
        // recommend it here?
        process.stderr.write(
          "There are no recommended releases on release track " +
            releaseTrack + ".\n");
        return 1;
      }
      if (! release.current || release.current.name !== latestRelease) {
        // The user asked for the latest release (well, they "asked for it" by not
        // passing --release). We're not currently running the latest release on
        // this track (we may have even just learned about it). #UpdateSpringboard
        throw new main.SpringboardToLatestRelease(releaseTrack);
      }
    }

    // At this point we should have a release. (If we didn't to start
    // with, #UpdateSpringboard fixed that.) And it can't be a checkout,
    // because we checked for that at the very beginning.
    if (! release.current || ! release.current.isProperRelease())
      throw new Error("don't have a proper release?");

    // If we're not in an app, then we're done (other than maybe printing some
    // stuff).
    if (! options.appDir) {
      if (release.forced || process.env.METEOR_SPRINGBOARD_RELEASE) {
        // We get here if:
        // 1) the user ran 'meteor update' and we found a new version
        // 2) the user ran 'meteor update --release xyz' (regardless of
        //    whether we found a new release)
        //
        // In case (1), we downloaded and installed the update and then
        // we springboarded (at #UpdateSpringboard above), causing
        // $METEOR_SPRINGBOARD_RELEASE to be true.
        // XXX probably should have a better interface than looking directly
        //     at the env var here
        //
        // In case (2), we downloaded, installed, and springboarded to
        // the requested release in the initialization code, before the
        // command even ran. They could equivalently have run 'meteor
        // help --release xyz'.
        process.stdout.write(
          "Installed. Run 'meteor update' inside of a particular project\n" +
            "directory to update that project to Meteor " +
            release.current.name + ".\n");
      } else {
        // We get here if the user ran 'meteor update' and we didn't
        // find a new version.

        if (couldNotContactServer) {
          // We already printed an error message about our inability to
          // ask the server if we're up to date.
        } else {
          process.stdout.write(
            "The latest version of Meteor," + release.current.name +
              " is already installed on this\n" +
              "computer. Run 'meteor update' inside of a particular project\n" +
              "directory to update that project to Meteor " +
              release.current.name + "\n");
        }
      }
      return;
    }

    // Otherwise, we have to upgrade the app too, if the release changed.
    var appRelease = project.getMeteorReleaseVersion();
    if (appRelease !== null && appRelease === release.current.name) {
      var maybeTheLatestRelease = release.forced ? "" : ", the latest release";
      var maybeOnThisComputer =
            couldNotContactServer ? "\ninstalled on this computer" : "";
      process.stdout.write(
        "This project is already at " +
        release.current.getDisplayName() + maybeTheLatestRelease +
        maybeOnThisComputer + ".\n");
      return;
    }

    // XXX: also while we are at it, we should consider disallowing both
    // options.patch and release.forced. Otherwise, the behavior is... what I had
    // to use to test this, actually ( update --patch --release
    // ekate-meteor@5.0.13 updated me to ekate-meteor@5.0.13.1) but that's way too
    // confusing to make sense.


    // XXX did we have to change some package versions? we should probably
    //     mention that fact.
    // XXX error handling.
    var releaseVersionsToTry;
    if (options.patch) {
      // XXX: something something something current release
      if (appRelease == null) {
        process.stderr.write(
          "Cannot patch update unless a release is set.\n");
        return 1;;
      }
      var r = appRelease.split('@');
      var record = catalog.official.getReleaseVersion(r[0], r[1]);
      var updateTo = record.patchReleaseVersion;
      if (!updateTo) {
        process.stderr.write(
          "You are at the latest patch version.\n");
        return 1;
      }
      releaseVersionsToTry = [updateTo];
    } else if (release.forced) {
      releaseVersionsToTry = [release.current.getReleaseVersion()];
    } else {
      // XXX clean up all this splitty stuff
      var appReleaseInfo = catalog.official.getReleaseVersion(
        appRelease.split('@')[0], appRelease.split('@')[1]);
      var appOrderKey = (appReleaseInfo && appReleaseInfo.orderKey) || null;
      releaseVersionsToTry = catalog.official.getSortedRecommendedReleaseVersions(
        releaseTrack, appOrderKey);
      if (!releaseVersionsToTry.length) {
        // XXX make error better, and make sure that the "already there" error
        // above truly does cover every other case
        var maybeOnThisComputer =
              couldNotContactServer ? "\ninstalled on this computer" : "";
        process.stdout.write(
          "This project is already at Meteor " + appRelease +
          ", which is newer than the latest release" + maybeOnThisComputer
          +".\n");
        return;
      }
    }

    var solutionPackageVersions = null;
    var directDependencies = project.getConstraints();
    var previousVersions;
    var messages = buildmessage.capture(function () {
      previousVersions = project.getVersions();
    });
    if (messages.hasMessages()) {
      process.stderr.write(messages.formatMessages());
      return 1;
    }
    var solutionReleaseVersion = _.find(releaseVersionsToTry, function (versionToTry) {
      var releaseRecord = catalog.complete.getReleaseVersion(releaseTrack, versionToTry);
      if (!releaseRecord)
        throw Error("missing release record?");
      var constraints = project.calculateCombinedConstraints(
        directDependencies, releaseRecord.packages);
      try {
        solutionPackageVersions = catalog.complete.resolveConstraints(
          constraints,
          { previousSolution: previousVersions },
          { ignoreProjectDeps: true });
      } catch (e) {
        // XXX we should make the error handling explicitly detectable, and not
        // actually mention failures that are recoverable
        process.stderr.write(
          "XXX Update to release " + releaseTrack +
            "@" + versionToTry + " impossible: " + e.message + "\n");
        return false;
      }
      return true;
    });

    if (!solutionReleaseVersion) {
      // XXX put an error here when we stop doing an error on every failure above
      return 1;
    }

    var solutionReleaseName = releaseTrack + '@' + solutionReleaseVersion;

    // We could at this point springboard to solutionRelease (which is no newer
    // than the release we are currently running), but there's no clear advantage
    // to this yet. The main reason might be if we decide to delete some
    // backward-compatibility code which knows how to deal with an older release,
    // but if we actually do that, we can change this code to add the extra
    // springboard at that time.

    var upgraders = require('./upgraders.js');
    var upgradersToRun = upgraders.upgradersToRun();

    // Write the new versions to .meteor/packages and .meteor/versions.
    var setV;
    messages = buildmessage.capture(function () {
      setV = project.setVersions(solutionPackageVersions,
                                 { alwaysRecord : true });
    });
    if (messages.hasMessages()) {
      process.stderr.write("Error while setting versions:\n" +
                           messages.formatMessages());
      return 1;
    }
    project.showPackageChanges(previousVersions, solutionPackageVersions, {
      onDiskPackages: setV.downloaded
    });
    if (!setV.success) {
      process.stderr.write("Could not install all the requested packages.\n");
      return 1;
    }

    // Write the release to .meteor/release.
    project.writeMeteorReleaseVersion(solutionReleaseName);

    process.stdout.write(path.basename(options.appDir) + ": updated to " +
                utils.displayRelease(releaseTrack, solutionReleaseVersion) +
                ".\n");

    // Now run the upgraders.
    // XXX should we also run upgraders on other random commands, in case there
    // was a crash after changing .meteor/release but before running them?
    _.each(upgradersToRun, function (upgrader) {
      upgraders.runUpgrader(upgrader);
      project.appendFinishedUpgrader(upgrader);
    });
  }

  // Update the packages to the latest version. We don't do this for patch
  // releases, or if you specified the release with a --release flag.  (Why?
  // Because it sure seems like you probably care about the release at that
  // point, that's what --release would look like anyway)
  if (!options['patch'] && !release.explicit) {
    // We can't update packages when we are not in a release.
    if (!options.appDir) return 0;

    var versions, allPackages;
    messages = buildmessage.capture(function () {
      versions = project.getVersions();
      allPackages = project.getCurrentCombinedConstraints();
    });
    if (messages.hasMessages()) {
      process.stderr.write(messages.formatMessages());
      return 1;
    }

    // If no packages have been specified, then we will send in a request to
    // update all direct dependencies. If a specific list of packages has been
    // specified, then only upgrade those.
    var upgradePackages;
    if (options.args.length === 0) {
      upgradePackages = _.pluck(allPackages, 'packageName');
    } else {
      upgradePackages = options.args;
    }

    // Call the constraint solver. This should not fail, since we are not adding
    // any constraints that we didn't have before.
    var newVersions = catalog.complete.resolveConstraints(allPackages, {
      previousSolution: versions,
      breaking: !options.minor,
      upgrade: upgradePackages
    }, {
      ignoreProjectDeps: true
    });

    // Just for the sake of good messages, check to see if anything changed.
    if (_.isEqual(newVersions, versions)) {
      process.stdout.write("All your package dependencies are already up to date.\n");
      return 0;
    }

    // Set our versions and download the new packages.
    messages = buildmessage.capture(function () {
      setV = project.setVersions(newVersions, { alwaysRecord : true });
    });
    // XXX cleanup this madness of error handling
    if (messages.hasMessages()) {
      process.stderr.write("Error while setting package versions:\n" +
                           messages.formatMessages());
      return 1;
    }
    var showExitCode = project.showPackageChanges(
      versions, newVersions, { onDiskPackages: setV.downloaded });
    if (!setV.success) {
      process.stderr.write("Could not install all the requested packages.\n");
      return 1;
    }
    return showExitCode;
  }
  return 0;
});




///////////////////////////////////////////////////////////////////////////////
// add
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'add',
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true,
  options: {
    // XXX come up with a better option name, like --allow-downgrades
    force: { type: Boolean, required: false }
  }
}, function (options) {

  var failed = false;

  // Refresh the catalog, cacheing the remote package data on the server.
  catalog.official.refresh();

  // Read in existing package dependencies.
  var packages = project.getConstraints();

  var allPackages;
  var messages = buildmessage.capture(function () {
    // Combine into one object mapping package name to list of constraints, to
    // pass in to the constraint solver.
    allPackages = project.getCurrentCombinedConstraints();
  });
  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }

  // For every package name specified, add it to our list of package
  // constraints. Don't run the constraint solver until you have added all of
  // them -- add should be an atomic operation regardless of the package
  // order. Even though the package file should specify versions of its inputs,
  // we don't specify these constraints until we get them back from the
  // constraint solver.
  var constraints = _.map(options.args, function (packageReq) {
    return utils.parseConstraint(packageReq);
  });
  _.each(constraints, function (constraint) {
    // Check that the package exists.
    if (! catalog.complete.getPackage(constraint.name)) {
      process.stderr.write(constraint.name + ": no such package\n");
      failed = true;
      return;
    }

    // If the version was specified, check that the version exists.
    if (constraint.version !== null) {
      var versionInfo = catalog.complete.getVersion(
        constraint.name,
        constraint.version);
      if (! versionInfo) {
        process.stderr.write(
          constraint.name + "@" + constraint.version  + ": no such version\n");
        failed = true;
        return;
      }
    }
    // Check that the constraint is new. If we are already using the package at
    // the same constraint in the app, return from this function.
    if (_.has(packages, constraint.name)) {
      if (packages[constraint.name] === constraint.constraintString) {
        if (constraint.constraintString) {
          process.stderr.write(
            constraint.name + " with version constraint " +
              constraint.constraintString + " has already been added.\n");
        } else {
          process.stderr.write(
            constraint.name +
              " without a version constraint has already been added.\n");
        }
        failed = true;
      } else {
        if (packages[constraint.name]) {
          process.stdout.write(
            "Currently using " + constraint.name +
              " with version constraint " + packages[constraint.name]
              + ".\n");
        } else {
          process.stdout.write("Currently using "+  constraint.name +
                               " without any version constraint.\n");
        }
        if (constraint.constraintString) {
          process.stdout.write("The version constraint will be changed to " +
                               constraint.constraintString + ".\n");
        } else {
          process.stdout.write("The version constraint will be removed.\n");
        }
      }
    }

    // Add the package to our direct dependency constraints that we get
    // from .meteor/packages.
    packages[constraint.name] = constraint.constraintString;

    // Also, add it to all of our combined dependencies.
    var constraintForResolver = _.clone(constraint);
    constraintForResolver.packageName = constraintForResolver.name;
    delete constraintForResolver.name;
    allPackages.push(constraintForResolver);
  });

  // If the user asked for invalid packages, then the user probably expects a
  // different result than what they are going to get. We have already logged an
  // error, so we should exit.
  if ( failed ) {
    return 1;
  }

  var downloaded, versions, newVersions;
  var messages = buildmessage.capture(function () {
    // Get the contents of our versions file. We need to pass them to the
    // constraint solver, because our contract with the user says that we will
    // never downgrade a dependency.
    versions = project.getVersions();

    // Call the constraint solver.
    var resolverOpts =  {
      previousSolution: versions,
      breaking: !!options.force
    };
    newVersions = catalog.complete.resolveConstraints(
      allPackages,
      resolverOpts,
      { ignoreProjectDeps: true });
    if ( ! newVersions) {
      // XXX: Better error handling.
      process.stderr.write("Cannot resolve package dependencies.\n");
      return;
    }

    // Don't tell the user what all the operations were until we finish -- we
    // don't want to give a false sense of completeness until everything is
    // written to disk.
    var messageLog = [];

    // Install the new versions. If all new versions were installed
    // successfully, then change the .meteor/packages and .meteor/versions to
    // match expected reality.
    downloaded = project.addPackages(constraints, newVersions);
  });
  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }

  var ret = project.showPackageChanges(versions, newVersions, {
    onDiskPackages: downloaded});
  if (ret !== 0) return ret;

  // Show the user the messageLog of the packages that they installed.
  process.stdout.write("\n");
  _.each(constraints, function (constraint) {
    var version = newVersions[constraint.name];
    var versionRecord = catalog.complete.getVersion(constraint.name, version);
    if (constraint.constraintString !== null &&
        version !== constraint.version) {
      process.stdout.write("Added " + constraint.name + " at version " + version +
                           " to avoid conflicting dependencies.\n");
    }
    process.stdout.write(constraint.name +
                         (versionRecord.description ?
                          (": " + versionRecord.description) :
                          "") + "\n");
  });

  return 0;
});


///////////////////////////////////////////////////////////////////////////////
// remove
///////////////////////////////////////////////////////////////////////////////
main.registerCommand({
  name: 'remove',
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true
}, function (options) {
  // Refresh the catalog, checking the remote package data on the
  // server. Technically, we don't need to do this, since it is unlikely that
  // new data will change our constraint solver decisions. But as a user, I
  // would expect this command to update the local catalog.
  catalog.official.refresh(true);

  // Read in existing package dependencies.
  var packages = project.getConstraints();

  // For each package name specified, check if we already have it and warn the
  // user. Because removing each package is a completely atomic operation that
  // has no chance of failure, this is just a warning message, it doesn't cause
  // us to stop.
  var packagesToRemove = [];
  _.each(options.args, function (packageName) {
    if (/@/.test(packageName)) {
      process.stderr.write(packageName + ": do not specify version constraints.\n");
    } else if (! _.has(packages, packageName)) {
      // Check that we are using the package. We don't check if the package
      // exists. You should be able to remove non-existent packages.
      process.stderr.write(packageName  + " is not in this project.\n");
    } else {
      packagesToRemove.push(packageName);
    }
  });

  var messages = buildmessage.capture(function () {
    // Get the contents of our versions file, we will want them in order to
    // remove to the user what we removed.
    var versions = project.getVersions();

    // Remove the packages from the project! There is really no way for this to
    // fail, unless something has gone horribly wrong, so we don't need to check
    // for it.
    project.removePackages(packagesToRemove);

    // Retrieve the new dependency versions that we have chosen for this project
    // and do some pretty output reporting.
    var newVersions = project.getVersions();
  });
  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }

  // Log that we removed the constraints. It is possible that there are
  // constraints that we officially removed that the project still 'depends' on,
  // which is why there are these two tiers of error messages.
  _.each(packagesToRemove, function (packageName) {
      process.stdout.write("Removed top-level dependency on " + packageName + ".\n");
  });

  return 0;
});


///////////////////////////////////////////////////////////////////////////////
// admin
///////////////////////////////////////////////////////////////////////////////

// For admin commands, at least in preview0.90, we can be kind of lazy and not bother
// to pre-check if the command will suceed client-side. That's because we both
// don't expect them to be called often and don't expect them to be called by
// inexperienced users, so waiting to get rejected by the server is OK.

main.registerCommand({
  name: 'admin maintainers',
  minArgs: 1,
  maxArgs: 1,
  options: {
    add: { type: String, short: "a" },
    remove: { type: String, short: "r" },
    list: { type: Boolean }
  }
}, function (options) {

  // We want the most recent information.
  catalog.official.refresh();
  var name = options.args[0];

  // Yay, checking that options are correct.
  if (options.add && options.remove) {
    process.stderr.write(
      "Sorry, you can only add or remove one user at a time.\n");
    return 1;
  }
  if ((options.add || options.remove) && options.list) {
    process.stderr.write(
"Sorry, you can't change the users at the same time as you're listing them.\n");
    return 1;
  }

  // Now let's get down to business! Fetching the thing.
  var fullRecord = getReleaseOrPackageRecord(name);
  var record = fullRecord.record;
  if (!options.list) {

    try {
      var conn = packageClient.loggedInPackagesConnection();
    } catch (err) {
      packageClient.handlePackageServerConnectionError(err);
      return 1;
    }

    try {
      if (options.add) {
        process.stdout.write("Adding a maintainer to " + name + "...\n");
        if (fullRecord.release) {
          conn.call('addReleaseMaintainer', name, options.add);
        } else {
          conn.call('addMaintainer', name, options.add);
        }
      } else if (options.remove) {
        process.stdout.write("Removing a maintainer from " + name + "...\n");
        if (fullRecord.release) {
          conn.call('removeReleaseMaintainer', name, options.remove);
        } else {
          conn.call('removeMaintainer', name, options.remove);
        }
        process.stdout.write(" Done!\n");
      }
    } catch (err) {
      process.stderr.write("\n" + err + "\n");
    }
    conn.close();
    catalog.official.refresh();
  }

  process.stdout.write("\n The maintainers for " + name + " are:\n");
  _.each(record.maintainers, function (user) {
    if (! user || !user.username)
      process.stdout.write("<unknown>" + "\n");
    else
      process.stdout.write(user.username + "\n");
  });
  return 0;
});

main.registerCommand({
  name: 'admin recommend-release',
  minArgs: 1,
  maxArgs: 1,
  options: {
    unrecommend: { type: Boolean, short: "u" }
  }
}, function (options) {

  // We want the most recent information.
  catalog.official.refresh();
  var release = options.args[0].split('@');
  var name = release[0];
  var version = release[1];
  if (!version) {
      process.stderr.write('\n Must specify release version (track@version)\n');
      return 1;
  }

  // Now let's get down to business! Fetching the thing.
  var record = catalog.official.getReleaseTrack(name);
  if (!record) {
      process.stderr.write('\n There is no release track named ' + name + '\n');
      return 1;
  }

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    if (options.unrecommend) {
      process.stdout.write("Unrecommending " + options.args[0] + "...\n");
      conn.call('unrecommendVersion', name, version);
      process.stdout.write("Done!\n " + options[0] +
                           " is no longer a recommended release\n");
    } else {
      process.stdout.write("Recommending " + options.args[0] + "...\n");
      conn.call('recommendVersion', name, version);
      process.stdout.write("Done!\n " + options[0] +
                           " is now  a recommended release\n");
    }
  } catch (err) {
    process.stderr.write("\n" + err + "\n");
  }
  conn.close();
  catalog.official.refresh();

  return 0;
});


main.registerCommand({
  name: 'admin set-earliest-compatible-version',
  minArgs: 2,
  maxArgs: 2
}, function (options) {

  // We want the most recent information.
  catalog.official.refresh();
  var package = options.args[0].split('@');
  var name = package[0];
  var version = package[1];
  if (!version) {
      process.stderr.write('\n Must specify release version (track@version)\n');
      return 1;
  }
  var ecv = options.args[1];

  // Now let's get down to business! Fetching the thing.
  var record = catalog.official.getPackage(name);
  if (!record) {
      process.stderr.write('\n There is no package named ' + name + '\n');
      return 1;
  }

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
      process.stdout.write(
        "Setting earliest compatible version on "
          + options.args[0] + " to " + ecv + "...\n");
      var versionInfo = { name : name,
                          version : version };
      conn.call('_setEarliestCompatibleVersion', versionInfo, ecv);
      process.stdout.write("Done!\n");
  } catch (err) {
    process.stderr.write("\n" + err + "\n");
  }
  conn.close();
  catalog.official.refresh();

  return 0;
});


main.registerCommand({
  name: 'admin change-homepage',
  minArgs: 2,
  maxArgs: 2
}, function (options) {

  // We want the most recent information.
  catalog.official.refresh();
  var name = options.args[0];
  var url = options.args[1];

  // Now let's get down to business! Fetching the thing.
  var record = catalog.official.getPackage(name);
  if (!record) {
      process.stderr.write('\n There is no package named ' + name + '\n');
      return 1;
  }

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
      process.stdout.write(
        "Changing homepage on  "
          + name + " to " + url + "...\n");
      conn.call('_changePackageHomepage', name, url);
      process.stdout.write("Done!\n");
  } catch (err) {
    process.stderr.write("\n" + err + "\n");
  }
  conn.close();
  catalog.official.refresh();

  return 0;
});
