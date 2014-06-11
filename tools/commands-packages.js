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
      packageSource.initFromPackageDir(packageName, options.packageDir);
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
  packageSource.initFromPackageDir(options.name, packageDir, true /* immutable */);
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
  process.stdout.write("Resyncing with package server. XXX Why so long? ]\n");
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
    process.stderr.write(
      "Configuration file must specify release version. (version). \n");
    badSchema = true;
  }
  if (!_.has(relConf, 'description')) {
    process.stderr.write(
      "Configuration file must contain a description (description). \n");
    badSchema = true;
  } else if (relConf['description'].length > 100) {
    process.stderr.write(
      "Description must be under 100 characters");
    badSchema = true;
  }
  if (!options['from-checkout']) {
    if (!_.has(relConf, 'tool')) {
      process.stderr.write(
        "Configuration file must specify a tool version (tool). \n ");
      badSchema = true;
    }
    if (!_.has(relConf, 'packages')) {
      process.stderr.write(
        "Configuration file must specify package versions (packages). \n");
      badSchema = true;
    }
  }
  if (!_.has(relConf, 'orderKey') && relConf['recommended']) {
    process.stderr.write(
      "Reccommended releases must have order keys. \n");
    badSchema = true;
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
      process.stderr.write('There is no release track named ' + relConf.track +
                           '. If you are creating a new track, use the --create-track flag. \n');
      return 1;
    }
    var auth = require("./auth.js");
    var authorized = _.indexOf(
      _.pluck(trackRecord.maintainers, 'username'), auth.loggedInUsername());
    if (authorized == -1) {
      process.stderr.write('You are not an authorized maintainer of ' + relConf.track + ".\n");
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
                packageSource.initFromPackageDir(item, packageDir);
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
                  process.stdout.write("IT IS NEW! \n");
                  return;
                } else {
                  var existingBuild = catalog.official.getBuildWithArchesString(
                    oldVersion,
                    compileResult.unipackage.architecturesString());

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
                    } else {
                      process.stdout.write("NEW VERSION! \n");
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
                    process.stderr.write(" NOT OK \n");
                  } else {
                    process.stdout.write("OK! \n");
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

  process.stdout.write("Done! \n");
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
  hidden: true
}, function (options) {

  catalog.official.refresh();

  if (options.details) {
    var changelog = require('./changelog.js');
    var packageName = options.args[0];
    var packageRecord = catalog.official.getPackage(packageName);
    if (!packageRecord) {
      console.log("Unknown package: ", packageName);
      return 1;
    }
    var versions = catalog.official.getSortedVersions(packageName);
    var lastVersion =  catalog.official.getVersion(
      packageName, versions[versions.length - 1]);
    if (!lastVersion) {
      console.log("No versions of package " + packageName + " exist.");
      console.log("It is maintained by " +
                  _.pluck(packageRecord.maintainers, 'username')
                  + " at https://github.com/meteor/meteor ");
      return 1;
    } else if (!lastVersion || !lastVersion.changelog) {
      console.log("No details available.");
    } else {
      var changelogUrl = lastVersion.changelog;
      var myChangelog = httpHelpers.getUrl({
        url: changelogUrl,
        encoding: null
      });
      var sourcePath = "/tmp/change";
      fs.writeFileSync(sourcePath, myChangelog);
      var ch = changelog.readChangelog(sourcePath);
      _.each(versions, function (v) {
        console.log("Version " + v + ":");
        changelog.printLines(ch[v], "             ");
      });
      console.log("\n");
    }
    console.log("The package " + packageName + " : " + lastVersion.description);
    console.log("Maintained by " + _.pluck(packageRecord.maintainers, 'username')
                + " at https://github.com/meteor/meteor ");
  } else {
    console.log("XXXX: SEARCH UNIMPLEMENTED");

    // Refresh the catalog, checking the remote package data on the server. If we
    // are only calling 'using', this is not nessessary, but, once again, as a
    // user, I would not be surprised to see this contact the server. In the
    // future, we should move this call to sync somewhere in the background.
    catalog.official.refresh(true);

    if (options.releases && options.using) {
      console.log("XXX: The contents of your release file.");
    } else if (options.releases) {
      // XXX: We probably want the recommended version rather than all of them,
      // but for now, let's just display some stuff to make sure that it worked.
      _.each(catalog.official.getAllReleaseTracks(), function (name) {
        var versions = catalog.official.getSortedRecommendedReleaseVersions(name);
        _.each(versions, function (version) {
          var versionInfo = catalog.official.getReleaseVersion(name, version);
          if (versionInfo) {
            items.push({ name: name + " " + version, description: versionInfo.description });
          }
        });
      });

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
      var versionInfo = catalog.official.getVersion(name, version);
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
