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
var PackageLoader = require('./package-loader.js').PackageLoader;
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
  return { record: rec, release: rel };
};


// Checks to see if you are an authorized maintainer for a given
// release/package. If you are not, calls process.exit
// explaining that you can't take that action.
//   record:  package or track record
//   action:  string for error handling
var checkAuthorizedPackageMaintainer = function (record, action) {
  var authorized = _.indexOf(
      _.pluck(record.maintainers, 'username'), auth.loggedInUsername());
  if (authorized == -1) {
      process.stderr.write('You are not an authorized maintainer of ' + record.name + ".\n");
      process.stderr.write('Only authorized maintainers may ' + action + ".\n");
      process.exit(1);
  }
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


var showPackageChanges = function (versions, newVersions, options) {
  // options.skipPackages
  // options.ondiskPackages

  // Don't tell the user what all the operations were until we finish -- we
  // don't want to give a false sense of completeness until everything is
  // written to disk.
  var messageLog = [];
  var failed = false;

  // Remove the versions that don't exist
  var removed = _.difference(_.keys(versions), _.keys(newVersions));
  _.each(removed, function(packageName) {
    messageLog.push("removed dependency on " + packageName);
  });

  _.each(newVersions, function(version, packageName) {
    if (failed)
      return;

    if (_.has(versions, packageName) &&
         versions[packageName] === version) {
      // Nothing changed. Skip this.
      return;
    }

    if (options.onDiskPackages &&
        (! options.onDiskPackages[packageName] ||
          options.onDiskPackages[packageName] !== version)) {
      // XXX maybe we shouldn't be letting the constraint solver choose
      // things that don't have the right arches?
      process.stderr.write("Package " + packageName +
                           " has no compatible build for version " +
                           version + "\n");
      failed = true;
      return;
    }

    // Add a message to the update logs to show the user what we have done.
    if ( _.contains(options.skipPackages, packageName)) {
      // If we asked for this, we will log it later in more detail.
      return;
    }

    // If the previous versions file had this, then we are upgrading, if it did
    // not, then we must be adding this package anew.
    if (_.has(versions, packageName)) {
      messageLog.push("  upgraded " + packageName + " from version " +
                      versions[packageName] +
                      " to version " + newVersions[packageName]);
    } else {
      messageLog.push("  added " + packageName +
                      " at version " + newVersions[packageName]);
    };
  });

  if (failed)
    return 1;

  // Show the user the messageLog of packages we added.
  _.each(messageLog, function (msg) {
    process.stdout.write(msg + "\n");
  });
  return 0;
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
    name: { type: String }
  },
  requiresPackage: true
}, function (options) {

  // Refresh the catalog, caching the remote package data on the server. We can
  // optimize the workflow by using this data to weed out obviously incorrect
  // submissions before they ever hit the wire.
  catalog.official.refresh(true);

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  if (! conn) {
    process.stderr.write('No connection: Publish failed\n');
    return 1;
  }

  process.stdout.write('Building package...\n');

  // XXX Prettify error messages

  var packageSource, compileResult;
  var messages = buildmessage.capture(
    { title: "building the package" },
    function () {
      var packageName = path.basename(options.packageDir);

      // XXX: This override is kind of gross because it requires you to set name
      // in package.js as well. We should just read out of that. On the other
      // hand, this is mostly used for forks, which are not quite a real thing in
      // 0.90.
      if (options.name && packageName !== options.name) {
        packageName = options.name;
      }

      if (! utils.validPackageName(packageName)) {
        buildmessage.error("Invalid package name:", packageName);
      }

      packageSource = new PackageSource;

      // Anything published to the server must have a version.
      packageSource.initFromPackageDir(packageName, options.packageDir, {
        requireVersion: true });
      if (buildmessage.jobHasMessages())
        return; // already have errors, so skip the build

      compileResult = compiler.compile(packageSource, { officialBuild: true });
    });

  if (messages.hasMessages()) {
    process.stdout.write(messages.formatMessages());
    return 1;
  }

  // We don't allow the tool to be published outside of the release process.
  // XXX: I think this behavior doesn't make sense.
/*  if (packageSource.includeTool) {
    process.stderr.write("The tools package may not be published directly. \n");
    return 1;
  }*/

  // We have initialized everything, so perform the publish oepration.
  var ec = packageClient.publishPackage(
    packageSource, compileResult, conn, { new: options.create });

  // We are only publishing one package, so we should close the connection, and
  // then exit with the previous error code.
  conn.close();

  catalog.official.refresh();
  return ec;
});


main.registerCommand({
  name: 'publish-for-arch',
  minArgs: 0,
  maxArgs: 0,
  options: {
    versionString: { type: String, required: true },
    name: { type: String, required: true }
  }
}, function (options) {

  // Refresh the catalog, cacheing the remote package data on the server.
  catalog.official.refresh(true);

  if (! catalog.complete.getPackage(options.name)) {
    process.stderr.write('No package named ' + options.name);
    return 1;
  }
  var pkgVersion = catalog.official.getVersion(options.name, options.versionString);
  if (! pkgVersion) {
    process.stderr.write('There is no version ' +
                         options.versionString + ' for package ' +
                         options.name);
    return 1;
  }

  if (! pkgVersion.source || ! pkgVersion.source.url) {
    process.stderr.write('There is no source uploaded for ' +
                         options.name + ' ' + options.versionString);
    return 1;
  }

  var sourceTarball = httpHelpers.getUrl({
    url: pkgVersion.source.url,
    encoding: null
  });
  var sourcePath = files.mkdtemp(options.name + '-' +
                                 options.versionString + '-source-');
  files.extractTarGz(sourceTarball, sourcePath);

  // XXX Factor out with packageClient.bundleSource so that we don't
  // have knowledge of the tarball structure in two places.
  var packageDir = path.join(sourcePath, options.name);

  if (! fs.existsSync(packageDir)) {
    process.stderr.write('Malformed source tarball');
    return 1;
  }

  var packageSource = new PackageSource;

  // This package source, although it is initialized from a directory is
  // immutable. It should be built exactly as is. If we need to modify anything,
  // such as the version lock file, something has gone terribly wrong and we
  // should throw.
  packageSource.initFromPackageDir(options.name, packageDir,  {
        requireVersion: true,
        immutable: true
  });

  var unipkg = compiler.compile(packageSource, {
    officialBuild: true
  }).unipackage;
  unipkg.saveToPath(path.join(packageDir, '.build.' + packageSource.name));

  var conn;
  try {
    conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  packageClient.createAndPublishBuiltPackage(conn, unipackage);


  catalog.official.refresh();
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
  catalog.official.refresh(true);

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
  process.stdout.write("Double-checking release schema ");

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
  process.stdout.write(".");

  // Check that the schema is valid -- release.json contains all the required
  // fields, does not contain contradicting information, etc. Output all
  // messages, so the user can fix all errors at once.
  // XXX: Check for unknown keys.
  var badSchema = false;
  if (!_.has(relConf, 'track')) {
   process.stderr.write(
      "Configuration file must specify release track. (track). \n");
    badSchema = true;
  }
  if (!_.has(relConf, 'version')) {
    if (!badSchema) process.stderr.write("\n");
    process.stderr.write(
      "Configuration file must specify release version. (version). \n");
    badSchema = true;
  }
  if (!_.has(relConf, 'description')) {
    if (!badSchema) process.stderr.write("\n");
    process.stderr.write(
      "Configuration file must contain a description (description). \n");
    badSchema = true;
  } else if (relConf['description'].length > 100) {
    if (!badSchema) process.stderr.write("\n");
    process.stderr.write(
      "Description must be under 100 characters");
    badSchema = true;
  }
  if (!options['from-checkout']) {
    if (!_.has(relConf, 'tool')) {
      if (!badSchema) process.stderr.write("\n");
      process.stderr.write(
        "Configuration file must specify a tool version (tool). \n");
      badSchema = true;
    }
    if (!_.has(relConf, 'packages')) {
      if (!badSchema) process.stderr.write("\n");
      process.stderr.write(
        "Configuration file must specify package versions (packages). \n");
      badSchema = true;
    }
  }
  if (!_.has(relConf, 'orderKey') && relConf['recommended']) {
    if (!badSchema) process.stderr.write("\n");
    process.stderr.write(
      "Reccommended releases must have order keys. \n");
    badSchema = true;
  }
  // On the main release track, we can't name the release anything beginning
  // with 0.8 and below, because those are taken for pre-troposphere releases.
  if ((relConf.track === catalog.official.DEFAULT_TRACK)) {
    var start = relConf.version.slice(0,4);
    if (start === "0.8." || start === "0.7." ||
        start === "0.6." || start === "0.5.") {
      if (!badSchema) process.stderr.write("\n");
      process.stderr.write(
        "It looks like you are trying to publish a pre-package-server meteor release. \n");
      process.stderr.write(
        "Doing this through the package server is going to cause a lot of confusion. \n" +
        "Please use the old release process. \n");
      badSchema = true;
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
                           '. If you are creating a new track, use the --create-track flag. \n');
      return 1;
    }
    var auth = require("./auth.js");
    var authorized = _.indexOf(
      _.pluck(trackRecord.maintainers, 'username'), auth.loggedInUsername());
    if (authorized == -1) {
      process.stderr.write('\n You are not an authorized maintainer of ' + relConf.track + ".\n");
      process.stderr.write('Only authorized maintainers may publish new versions. \n');
      return 1;
    }
  }
  process.stdout.write(". OK! \n");

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
      process.stderr.write("Must run from checkout to make release from checkout. \n");
      return 1;
    };

    // We are going to disable publishing a release from checkout and an appDir,
    // just to be extra safe about local packages. There is never a good reason
    // why you would do that, and maybe you are confused about what you are
    // trying to do.
    if (options.appDir) {
      process.stderr.write("Trying to publish from checkout while in an application " +
                           "directory is a bad idea." +
                           " Please try again from somewhere else. \n");
      return 1;
    }

    // You should not use a release configuration with packages&tool *and* a
    // from checkout option, at least for now. That's potentially confusing
    // (which ones did you mean to use) and makes it likely that you did one of
    // these by accident. So, we will disallow it for now.
    if (relConf.packages || relConf.tool) {
      process.stderr.write(
        "Setting the --from-checkout option will use the tool & packages in your meteor " +
        "checkout. \n" +
        "Your release configuration file should not contain that information. \n");
      return 1;
    }

    // Now, let's collect all the packages in our meteor/packages directory. We
    // are going to be extra-careful to publish only those packages, and not
    // just all local packages -- we might be running this from an app
    // directory, though we really shouldn't be, or, if we ever restructure the
    // way that we store packages in the meteor directory, we should be sure to
    // reevaluate what this command actually does.
    var localPackageDir = path.join(files.getCurrentToolsDir(),"packages");
    var contents = fs.readdirSync(localPackageDir);
    var myPackages = {};
    var toPublish = {};
    var messages = buildmessage.capture(
      {title: "rebuilding local packages"},
      function () {
        process.stdout.write("Rebuilding local packages... \n");
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
                  process.stderr.write("Error reading package:" + item + "\n");
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
                var compileResult = compiler.compile(packageSource,
                                                     { officialBuild: true });
                if (buildmessage.jobHasMessages()) {
                  process.stderr.write("Error compiling unipackage:" + item + "\n");
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
                  process.stdout.write("new package\n");
                  return;
                } else {
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
                                       + ". Please upgrade version number. \n");
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
     process.stdout.write("\n" + messages.formatMessages());
     return 1;
   };

   // We now have an object of packages that have new versions on disk that
   // don't exist in the server catalog. Publish them.
  _.each(toPublish,
   function(prebuilt, name) {
     var opts = {
       new: !catalog.official.getPackage(name)
     };
     process.stdout.write("Publishing package: " + name + "\n");

     // If we are creating a new package, dsPS will document this for us, so we
     // don't need to do this here. Though, in the future, once we are done
     // bootstrapping package servers, we should consider having some extra
     // checks around this.
     var pub = packageClient.publishPackage(
       prebuilt.source,
       prebuilt.compileResult,
       conn,
       opts);

     // If we fail to publish, just exit outright, something has gone wrong.
     if (pub > 0) {
       process.stderr.write("Failed to publish: " + name + "\n");
       process.exit(1);
     }
   });

   // Set the remaining release information. For now, when we publish from
   // checkout, we always set the meteor tool as the tool. We don't include the
   // tool in the packages list.
   relConf.tool="meteor-tool@" + myPackages["meteor-tool"];
   delete myPackages["meteor-tool"];
   relConf.packages=myPackages;
  }

  // Create the new track, if we have been told to.
  if (options['create-track']) {
    process.stdout.write("Creating a new release track... \n");
    var track = conn.call('createReleaseTrack',
                         { name: relConf.track } );
  }

  process.stdout.write("Creating a new release version... \n");
  // Send it over!
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
  if (!relConf.patchFrom) {
    uploadInfo = conn.call('createReleaseVersion', record);
  } else {
    uploadInfo = conn.call('createPatchReleaseVersion', record, relConf.patchFrom);
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
  minArgs: 1,
  maxArgs: 1,
  options: {
    details: { type: Boolean, required: false }
  },
}, function (options) {

  catalog.official.refresh();

  if (options.details) {
    var packageName = options.args[0];
    var packageRecord = catalog.official.getPackage(packageName);
    if (!packageRecord) {
      console.log("Unknown package or release: ", packageName);
      return 1;
    }
    var versions = catalog.official.getSortedVersions(packageName);
    var lastVersion =  catalog.official.getVersion(
      packageName, versions[versions.length - 1]);
    if (!lastVersion) {
      console.log("No versions of package " + packageName + " exist.");
      console.log("It is maintained by " +
                  _.pluck(packageRecord.maintainers, 'username')
                  + " at " + packageRecord.repositoryUrl);
      return 1;
    } else if (!lastVersion) {
      console.log("No versions are available.");
    } else {
      _.each(versions, function (v) {
        var versionRecord = catalog.official.getVersion(packageName, v);
        // XXX: should we print out something other than decription here?
        console.log("Version " + v + " : " + versionRecord.description);
      });
      console.log("\n");
    }
    console.log("The package " + packageName + " : " + lastVersion.description);
    console.log("Maintained by " + _.pluck(packageRecord.maintainers, 'username')
                + " at " + packageRecord.repositoryUrl);
  } else {
    var search = options.args[0];

    var allPackages = catalog.official.getAllPackageNames();
    var allReleases = catalog.official.getAllReleaseTracks();
    var matchingPackages = [];
    var matchingReleases = [];

    _.each(allPackages, function (pack) {
      if (pack.match(search)) {
        var vr = catalog.official.getLatestVersion(pack);
        if (vr) {
          matchingPackages.push(
            { name: pack, description: vr.description });
        }
      }
    });
    _.each(allReleases, function (track) {
      if (track.match(search)) {
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
      console.log("Found the following packages:");
      process.stdout.write(formatList(matchingPackages) + "\n");
    }

    if (!_.isEqual(matchingReleases, [])) {
      output = true;
      console.log("Found the following releases:");
      process.stdout.write(formatList(matchingReleases) + "\n");
    }

    if (!output) {
      console.log(
"Neither packages nor releases containing the string \'" + search + "\' could be found.");
    } else {
      console.log(
"To get more information on a specific item, use meteor search --details.");
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

  // Packages that are used by this app
  var packages = project.getConstraints();
  // Versions of the packages. We need this to get the right description for the
  // user, in case it changed between versions.
  var versions = project.getVersions();

  var messages = buildmessage.capture(function () {
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
      items.push({ name: name, description: versionInfo.description });

    });
  });
  if (messages.hasMessages()) {
    process.stdout.write("\n" + messages.formatMessages());
    return 1;
  }
  process.stdout.write(formatList(items));
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
  maxArgs: Infinity,
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
    process.exit(1);
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
        console.log(
          "Installed. Run 'meteor update' inside of a particular project\n" +
            "directory to update that project to Meteor %s.", release.current.name);
      } else {
        // We get here if the user ran 'meteor update' and we didn't
        // find a new version.

        if (couldNotContactServer) {
          // We already printed an error message about our inability to
          // ask the server if we're up to date.
        } else {
          console.log(
            "The latest version of Meteor, %s, is already installed on this\n" +
              "computer. Run 'meteor update' inside of a particular project\n" +
              "directory to update that project to Meteor %s.",
            release.current.name, release.current.name);
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
      console.log(
        "This project is already at %s%s%s.",
        release.current.getDisplayName(), maybeTheLatestRelease,
        maybeOnThisComputer);
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
        console.log(
          "Cannot patch update unless a release is set.");
        process.exit(1);
      }
      var r = appRelease.split('@');
      var record = catalog.official.getReleaseVersion(r[0], r[1]);
      var updateTo = record.patchReleaseVersion;
      if (!updateTo) {
        console.log(
          "You are at the latest patch version.");
        process.exit(1);
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
        console.log(
          "This project is already at Meteor %s, which is newer than the latest release%s.",
          appRelease, maybeOnThisComputer);
        return;
      }
    }

    var solutionPackageVersions = null;
    var directDependencies = project.getConstraints();
    var previousVersions = project.getVersions();
    var solutionReleaseVersion = _.find(releaseVersionsToTry, function (versionToTry) {
      var releaseRecord = catalog.complete.getReleaseVersion(releaseTrack, versionToTry);
      if (!releaseRecord)
        throw Error("missing release record?");
      var constraints = project.calculateCombinedConstraints(
        directDependencies, releaseRecord.packages);
      try {
        solutionPackageVersions = catalog.complete.resolveConstraints(
          constraints, { previousSolution: previousVersions });
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

    // XXX did we have to change some package versions? we should probably
    //     mention that fact.

    // Write the new versions to .meteor/packages and .meteor/versions.
    project.setVersions(solutionPackageVersions);

    // Write the release to .meteor/release.
    project.writeMeteorReleaseVersion(solutionReleaseName);

    console.log("%s: updated to %s.",
                path.basename(options.appDir),
                utils.displayRelease(releaseTrack, solutionReleaseVersion));

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

    var versions = project.getVersions();
    var allPackages = project.getCurrentCombinedConstraints();
    var upgradePackages;

    // If no packages have been specified, then we will send in a request to
    // update all direct dependencies. If a specific list of packages has been
    // specified, then only upgrade those.
    if (options.args.length === 0) {
      upgradePackages = allPackages;
    } else {
      upgradePackages = options.args;
    }

    // Call the constraint solver. This should not fail, since we are not adding
    // any constraints that we didn't have before.
    var newVersions = catalog.complete.resolveConstraints(allPackages, {
      previousSolution: versions,
      breaking: !options.minor,
      upgrade: _.pluck(upgradePackages, 'packageName')
    });

    // Just for the sake of good messages, check to see if anything changed.
    if (_.isEqual(newVersions, versions)) {
      process.stdout.write("All your package dependencies are already up to date.\n");
      return 0;
    }

    // Set our versions and download the new packages.
    var downloaded = project.setVersions(newVersions);

    // Display changes: what we have added/removed/upgraded.
    showPackageChanges(versions, newVersions, {
       ondiskPackages: downloaded});
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

  // Combine into one object mapping package name to list of
  // constraints, to pass in to the constraint solver.
  var allPackages = project.getCurrentCombinedConstraints();

  // For every package name specified, add it to our list of package
  // constraints. Don't run the constraint solver until you have added all of
  // them -- add should be an atomic operation regardless of the package
  // order. Even though the package file should specify versions of its inputs,
  // we don't specify these constraints until we get them back from the
  // constraint solver.
  var constraints = _.map(options.args, function (packageReq) {
    return utils.splitConstraint(packageReq);
  });

  _.each(constraints, function (constraint) {
    // Check that the package exists.
    if (! catalog.complete.getPackage(constraint.package)) {
      process.stderr.write(constraint.package + ": no such package\n");
      failed = true;
      return;
    }

    // If the version was specified, check that the version exists.
    if ( constraint.constraint !== null) {
      var versionInfo = catalog.complete.getVersion(
        constraint.package,
        constraint.constraint);
      if (! versionInfo) {
        process.stderr.write(
          constraint.package + "@" + constraint.constraint  + ": no such version\n");
        failed = true;
        return;
      }
    }
    // Check that the constraint is new. If we are already using the package at
    // the same constraint in the app, return from this function.
    if (_.has(packages, constraint.package)) {
      if  (packages[constraint.package] === constraint.constraint) {
      process.stderr.write(constraint.package + " with version constraint " +
                           constraint.constraint + " has already been added.\n");
      failed = true;
      } else {
        process.stdout.write("Currently using "+  constraint.package +
                             " with version constraint " + packages[constraint.package]);
        process.stdout.write("Constraint will be changed to " +
                              constraint.constraint + "/n");
      }
    }

    // Add the package to our direct dependency constraints that we get
    // from .meteor/packages.
    packages[constraint.package] = constraint.constraint;

    // Also, add it to all of our combined dependencies.
    allPackages.push(
      _.extend({ packageName: constraint.package },
                 utils.parseVersionConstraint(constraint.constraint)));
  });

  // If the user asked for invalid packages, then the user probably expects a
  // different result than what they are going to get. We have already logged an
  // error, so we should exit.
  if ( failed ) {
    return 1;
  }

  // Get the contents of our versions file. We need to pass them to the
  // constraint solver, because our contract with the user says that we will
  // never downgrade a dependency.
  var versions = project.getVersions();


  // Call the constraint solver.
  var resolverOpts =  {
    previousSolution: versions,
    breaking: !!options.force
  };
  var newVersions = catalog.complete.resolveConstraints(allPackages,
                                               resolverOpts,
                                               { ignoreProjectDeps: true });
  if ( ! newVersions) {
    // XXX: Better error handling.
    process.stderr.write("Cannot resolve package dependencies.");
  }

  // Don't tell the user what all the operations were until we finish -- we
  // don't want to give a false sense of completeness until everything is
  // written to disk.
  var messageLog = [];


  // Install the new versions. If all new versions were installed successfully,
  // then change the .meteor/packages and .meteor/versions to match expected
  // reality.
  var downloaded = project.addPackages(constraints, newVersions);

  showPackageChanges(versions, newVersions, {
    skipPackages: constraints,
    ondiskPackages: downloaded});

  // Show the user the messageLog of the packages that they installed.
  process.stdout.write("Successfully added the following packages. \n");
  _.each(constraints, function (constraint) {
    var version = newVersions[constraint.package];
    var versionRecord = catalog.complete.getVersion(constraint.package, version);
    if (constraint.constraint !== null &&
        version !== constraint.constraint) {
      process.stdout.write("Added " + constraint.package + " at version " + version +
                           " to avoid conflicting dependencies. \n");
    }
    process.stdout.write(constraint.package + " : " + versionRecord.description + "\n");
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
  _.each(options.args, function (packageName) {
    // Check that we are using the package. We don't check if the package
    // exists. You should be able to remove non-existent packages.
    if (! _.has(packages, packageName)) {
      process.stderr.write( packageName  + " is not in this project \n");
    }
  });


  // Get the contents of our versions file, we will want them in order to remove
  // to the user what we removed.
  var versions = project.getVersions();

  // Remove the packages from the project! There is really no way for this to
  // fail, unless something has gone horribly wrong, so we don't need to check
  // for it.
  project.removePackages(options.args);

  // Retrieve the new dependency versions that we have chosen for this project
  // and do some pretty output reporting.
  var newVersions = project.getVersions();

  // Show what we did. (We removed some things)
  showPackageChanges(versions, newVersions, {
    skipPackages: options.args });

  // Log that we removed the constraints. It is possible that there are
  // constraints that we officially removed that the project still 'depends' on,
  // which is why there are these two tiers of error messages.
  _.each(options.args, function (packageName) {
      process.stdout.write("Removed constraint " + packageName + " from project \n");
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

    checkAuthorizedPackageMaintainer(record, " add or remove maintainers");

    try {
      var conn = packageClient.loggedInPackagesConnection();
    } catch (err) {
      packageClient.handlePackageServerConnectionError(err);
      return 1;
    }

    try {
      if (options.add) {
        process.stdout.write("Adding a maintainer to " + name + "...");
        if (fullRecord.release) {
          conn.call('addReleaseMaintainer', name, options.add);
        } else {
          conn.call('addMaintainer', name, options.add);
        }
      } else if (options.remove) {
        process.stdout.write("Removing a maintainer from " + name + "...");
        if (fullRecord.release) {
          conn.call('removeReleaseMaintainer', name, options.remove);
        } else {
          conn.call('removeMaintainer', name, options.remove);
        }
        process.stdout.write(" Done! \n");
      }
    } catch (err) {
      process.stdout.write("\n" + err + "\n");
    }
    conn.close();
    catalog.official.refresh();
  }

  process.stdout.write("\n The maintainers for " + name + " are: \n");
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
      process.stderr.write('\n Must specify release version (track@version) \n');
      return 1;
  }

  // Now let's get down to business! Fetching the thing.
  var record = catalog.official.getReleaseTrack(name);
  if (!record) {
      process.stderr.write('\n There is no release track named ' + name + '\n');
      return 1;
  }

  checkAuthorizedPackageMaintainer(record, " recommend or unrecommend release");

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    if (options.unrecommend) {
      process.stdout.write("Unrecommending " + options.args[0] + "...");
      conn.call('unrecommendVersion', name, version);
      process.stdout.write("Done! \n " + options[0] +
                           " is no longer a recommended release \n");
    } else {
      process.stdout.write("Recommending " + options.args[0] + "...");
      conn.call('recommendVersion', name, version);
      process.stdout.write("Done! \n " + options[0] +
                           " is now  a recommended release \n");
    }
  } catch (err) {
    process.stdout.write("\n" + err + "\n");
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
      process.stderr.write('\n Must specify release version (track@version) \n');
      return 1;
  }
  var ecv = options.args[1];

  // Now let's get down to business! Fetching the thing.
  var record = catalog.official.getPackage(name);
  if (!record) {
      process.stderr.write('\n There is no package named ' + name + '\n');
      return 1;
  }

  checkAuthorizedPackageMaintainer(record, " set earliest recommended version");

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
      process.stdout.write(
        "Setting earliest compatible version on "
          + options.args[0] + " to " + ecv + "...");
      var versionInfo = { name : name,
                          version : version };
      conn.call('_setEarliestCompatibleVersion', versionInfo, ecv);
      process.stdout.write("Done! \n");
  } catch (err) {
    process.stdout.write("\n" + err + "\n");
  }
  conn.close();
  catalog.official.refresh();

  return 0;
});


main.registerCommand({
  name: 'admin change-package-url',
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

  checkAuthorizedPackageMaintainer(record, " change repository URL");

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
      process.stdout.write(
        "Changing package repository URL on  "
          + name + " to " + url + "...");
      conn.call('_changePackageUrl', name, url);
      process.stdout.write("Done! \n");
  } catch (err) {
    process.stdout.write("\n" + err + "\n");
  }
  conn.close();
  catalog.official.refresh();

  return 0;
});
