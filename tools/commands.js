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

// Given a site name passed on the command line (eg, 'mysite'), return
// a fully-qualified hostname ('mysite.meteor.com').
//
// This is fairly simple for now. It appends 'meteor.com' if the name
// doesn't contain a dot, and it deletes any trailing dots (the
// technically legal hostname 'mysite.com.' is canonicalized to
// 'mysite.com').
//
// In the future, you should be able to make this default to some
// other domain you control, rather than 'meteor.com'.
var qualifySitename = function (site) {
  if (site.indexOf(".") === -1)
    site = site + ".meteor.com";
  while (site.length && site[site.length - 1] === ".")
    site = site.substring(0, site.length - 1);
  return site;
};

// Given a (non necessarily fully qualified) site name from the
// command line, return true if the site is hosted by a Galaxy, else
// false.
var hostedWithGalaxy = function (site) {
  var site = qualifySitename(site);
  return !! require('./deploy-galaxy.js').discoverGalaxy(site);
};

// Get all local packages available. Returns a map from the package name to the
// version record for that package.
var getLocalPackages = function () {
  var ret = {};

  var names = catalog.complete.getAllPackageNames();
  _.each(names, function (name) {
    if (catalog.complete.isLocalPackage(name)) {
      ret[name] = catalog.complete.getLatestVersion(name);
    }
  });

  return ret;
};

var XXX_DEPLOY_ARCH = 'os.linux.x86_64';

///////////////////////////////////////////////////////////////////////////////
// options that act like commands
///////////////////////////////////////////////////////////////////////////////

// Prints the Meteor architecture name of this host
main.registerCommand({
  name: '--arch',
  requiresRelease: false
}, function (options) {
  var archinfo = require('./archinfo.js');
  console.log(archinfo.host());
});

// Prints the current release in use. Note that if there is not
// actually a specific release, we print to stderr and exit non-zero,
// while if there is a release we print to stdout and exit zero
// (making this useful to scripts).
// XXX: What does this mean in our new release-free world?
main.registerCommand({
  name: '--version',
  requiresRelease: false
}, function (options) {
  if (release.current === null) {
    if (! options.appDir)
      throw new Error("missing release, but not in an app?");
    process.stderr.write(
"This project was created with a checkout of Meteor, rather than an\n" +
"official release, and doesn't have a release number associated with\n" +
"it. You can set its release with 'meteor update'.\n");
    return 1;
  }

  if (release.current.isCheckout()) {
    process.stderr.write("Unreleased (running from a checkout)\n");
    return 1;
  }

  console.log("Release " + release.current.name);
});

// Internal use only. For automated testing.
main.registerCommand({
  name: '--long-version',
  requiresRelease: false
}, function (options) {
  if (files.inCheckout()) {
    process.stderr.write("checkout\n");
    return 1;
  } else if (release.current === null) {
    // .meteor/release says "none" but not in a checkout.
    process.stderr.write("none\n");
    return 1;
  } else {
    process.stdout.write(release.current.name + "\n");
    process.stdout.write(files.getToolsVersion() + "\n");
    return 0;
  }
});

// Internal use only. Makes sure that your Meteor install is totally good to go
// (is "airplane safe"). Specifically, make sure that you have built and/or
// downloaded any packages that you need to run your app (ie: ran the constraint
// solver on the .meteor/packages file and then downloaded/built everything in
// the resulting .meteor/versions).
//
// In a checkout, this makes sure that the checkout is "complete" (dev bundle
// downloaded and all NPM modules installed). The use case is, for example,
// cloning an app from github, running this command, then getting on an
// airplane.
//
// XXX: What happens if you run from checkout and want to build all local
// packages, is this a thing right now? Unclear.
main.registerCommand({
  name: '--get-ready',
  requiresApp: true
}, function (options) {

  // We need the package loader to compile our packages, so let's make sure to
  // get one.
  var loader = project.getPackageLoader();

  // Then get the list of packages that we need to get and build.
  var allPackages = project.getVersions();

  var messages = buildmessage.capture(function () {
    _.forEach(allPackages, function (versions, name) {
      // Calling getPackage on the loader will return a unipackage object, which
      // means that the package will be compiled/downloaded. That we throw the
      // package variable away afterwards is immaterial.
      loader.getPackage(name);
    });
  });

  if (messages.hasMessages()) {
    process.stdout.write("\n" + messages.formatMessages());
    return 1;
  };

  return 0;
});

///////////////////////////////////////////////////////////////////////////////
// run
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'run',
  requiresApp: true,
  options: {
    port: { type: String, short: "p", default: '3000' },
    'app-port': { type: String },
    production: { type: Boolean },
    'raw-logs': { type: Boolean },
    settings: { type: String },
    program: { type: String },
    // With --once, meteor does not re-run the project if it crashes
    // and does not monitor for file changes. Intentionally
    // undocumented: intended for automated testing (eg, cli-test.sh),
    // not end-user use. #Once
    once: { type: Boolean }
  }
}, function (options) {
  // XXX factor this out into a {type: host/port}?
  var portMatch = options.port.match(/^(?:(.+):)?([0-9]+)$/);
  if (!portMatch) {
    process.stderr.write(
"run: --port (-p) must be a number or be of the form 'host:port' where\n" +
"port is a number. Try 'meteor help run' for help.\n");
    return 1;
  }
  var proxyHost = portMatch[1] || null;
  var proxyPort = parseInt(portMatch[2]);

  var appHost, appPort;
  if (options['app-port']) {
    var appPortMatch = options['app-port'].match(/^(?:(.+):)?([0-9]+)?$/);
    if (!appPortMatch) {
      process.stderr.write(
"run: --app-port must be a number or be of the form 'host:port' where\n" +
"port is a number. Try 'meteor help run' for help.\n");
      return 1;
    }
    appHost = appPortMatch[1] || null;
    // It's legit to specify `--app-port host:` and still let the port be
    // randomized.
    appPort = appPortMatch[2] ? parseInt(appPortMatch[2]) : null;
  }

  if (release.forced) {
    var appRelease = project.getMeteorReleaseVersion();
    if (release.current.name !== appRelease) {
      console.log("=> Using Meteor %s as requested (overriding Meteor %s)",
                  release.current.name, appRelease);
      console.log();
    }
  }

  auth.tryRevokeOldTokens({timeout: 1000});

  if (options['raw-logs'])
    runLog.setRawLogs(true);

  var runAll = require('./run-all.js');
  return runAll.run(options.appDir, {
    proxyPort: proxyPort,
    proxyHost: proxyHost,
    appPort: appPort,
    appHost: appHost,
    settingsFile: options.settings,
    program: options.program || undefined,
    buildOptions: {
      minify: options.production
    },
    rootUrl: process.env.ROOT_URL,
    mongoUrl: process.env.MONGO_URL,
    oplogUrl: process.env.MONGO_OPLOG_URL,
    once: options.once
  });
});

///////////////////////////////////////////////////////////////////////////////
// create
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'create',
  maxArgs: 1,
  options: {
    list: { type: Boolean },
    example: { type: String },
  }
}, function (options) {
  // Suppose you have an app A, and from some directory inside that
  // app, you run 'meteor create /my/new/app'. The new app should use
  // the latest available Meteor release, not the release that A
  // uses. So if we were run from inside an app directory, and the
  // user didn't force a release with --release, we need to
  // springboard to the correct release and tools version.
  //
  // (In particular, it's not sufficient to create the new app with
  // this version of the tools, and then stamp on the correct release
  // at the end.)
  if (! release.current.isCheckout() &&
      release.current.name !== release.latestDownloaded() &&
      ! release.forced) {
    throw new main.SpringboardToLatestRelease;
  }

  var exampleDir = path.join(__dirname, '..', 'examples');
  var examples = _.reject(fs.readdirSync(exampleDir), function (e) {
    return (e === 'unfinished' || e === 'other'  || e[0] === '.');
  });

  if (options.list) {
    process.stdout.write("Available examples:\n");
    _.each(examples, function (e) {
      process.stdout.write("  " + e + "\n");
    });
    process.stdout.write("\n" +
"Create a project from an example with 'meteor create --example <name>'.\n");
    return 0;
  };

  var appPath;
  if (options.args.length === 1)
    appPath = options.args[0];
  else if (options.example)
    appPath = options.example;
  else
    throw new main.ShowUsage;

  if (fs.existsSync(appPath)) {
    process.stderr.write(appPath + ": Already exists\n");
    return 1;
  }

  if (files.findAppDir(appPath)) {
    process.stderr.write(
      "You can't create a Meteor project inside another Meteor project.\n");
    return 1;
  }

  var transform = function (x) {
    return x.replace(/~name~/g, path.basename(appPath));
  };

  if (options.example) {
    if (examples.indexOf(options.example) === -1) {
      process.stderr.write(options.example + ": no such example\n\n");
      process.stderr.write("List available applications with 'meteor create --list'.\n");
      return 1;
    } else {
      files.cp_r(path.join(exampleDir, options.example), appPath, {
        ignore: [/^local$/]
      });
    }
  } else {
    files.cp_r(path.join(__dirname, 'skel'), appPath, {
      transformFilename: function (f) {
        return transform(f);
      },
      transformContents: function (contents, f) {
        if ((/(\.html|\.js|\.css)/).test(f))
          return new Buffer(transform(contents.toString()));
        else
          return contents;
      },
      ignore: [/^local$/]
    });
  }

  // We are actually working with a new meteor project at this point, so
  // reorient its path.
  project.setRootDir(appPath);
  project.writeMeteorReleaseVersion(
    release.current.isCheckout() ? "none" : release.current.name);

  process.stderr.write(appPath + ": created");
  if (options.example && options.example !== appPath)
    process.stderr.write(" (from '" + options.example + "' template)");
  process.stderr.write(".\n\n");

  process.stderr.write(
    "To run your new app:\n" +
      "   cd " + appPath + "\n" +
      "   meteor\n");
});

// For now, this literally drops a package into a directory.
main.registerCommand({
  name: 'create-package',
  hidden: true,
  maxArgs: 1
}, function (options) {

  var appPath;
  if (options.args.length === 1)
    appPath = options.args[0];
  else if (options.example)
    appPath = options.example;
  else
    throw new main.ShowUsage;

  if (fs.existsSync(appPath)) {
    process.stderr.write(appPath + ": Already exists\n");
    return 1;
  }

  files.cp_r(path.join(__dirname, 'skel-pack'), appPath);

  process.stderr.write(appPath + ": created");
  process.stderr.write(".\n\n");
  return 0;

});


///////////////////////////////////////////////////////////////////////////////
// update
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'update',
  options: {
    patch: { type: Boolean, required: false },
    packages: { type: Boolean, required: false },
    minor: { type: Boolean, required: false }
  },
  // We have to be able to work without a release, since 'meteor
  // update' is how you fix apps that don't have a release.
  requiresRelease: false
}, function (options) {
  // XXX clean this up if we don't end up using it, but we probably should be
  // using it on the refresh call
  var couldNotContactServer = false;

  // Refresh the catalog, cacheing the remote package data on the server.
  catalog.official.refresh(true);

  if (options.packages) {
    var versions = project.getVersions();
    var allPackages = project.getCurrentCombinedConstraints();
    var newVersions = catalog.complete.resolveConstraints(allPackages, {
      previousSolution: versions,
      breaking: !options.minor,
      upgrade: true
    });
    project.setVersions(newVersions);
    process.exit(0);
  }

  // refuse to update if we're in a git checkout.
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
"This project is already at Meteor %s%s%s.",
      appRelease, maybeTheLatestRelease, maybeOnThisComputer);
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

  console.log("%s: updated to Meteor %s.",
              path.basename(options.appDir), solutionReleaseName);

  // Now run the upgraders.
  // XXX should we also run upgraders on other random commands, in case there
  // was a crash after changing .meteor/release but before running them?
  _.each(upgradersToRun, function (upgrader) {
    upgraders.runUpgrader(upgrader);
    project.appendFinishedUpgrader(upgrader);
  });
});

///////////////////////////////////////////////////////////////////////////////
// run-upgrader
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'run-upgrader',
  hidden: true,
  minArgs: 1,
  maxArgs: 1,
  requiresApp: true
}, function (options) {
  var upgrader = options.args[0];

  var upgraders = require("./upgraders.js");
  console.log("%s: running upgrader %s.",
              path.basename(options.appDir), upgrader);
  upgraders.runUpgrader(upgrader);
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
    // XXX maybe upper case is an error instead?
    return utils.splitConstraint(packageReq.toLowerCase());
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
    if (_.has(packages, constraint.package) &&
        packages[constraint.package] === constraint.constraint) {
      process.stderr.write(constraint.package + " with version constraint " +
                           constraint.constraint + " has already been added.\n");
      failed = true;
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

  // Remove the versions that don't exist
  var removed = _.difference(_.keys(versions), _.keys(newVersions));
  _.each(removed, function(packageName) {
    messageLog.push("removed dependency on " + packageName);
  });

  // Install the new versions. If all new versions were installed successfully,
  // then change the .meteor/packages and .meteor/versions to match expected
  // reality.
  var downloaded = project.addPackages(constraints, newVersions);

  _.each(newVersions, function(version, packageName) {
    if (failed)
      return;

    if (_.has(versions, packageName) &&
         versions[packageName] === version) {
      // Nothing changed. Skip this.
      return;
    }

    if (! downloaded[packageName] || downloaded[packageName] !== version) {
      // XXX maybe we shouldn't be letting the constraint solver choose
      // things that don't have the right arches?
      process.stderr.write("Package " + packageName +
                           " has no compatible build for version " +
                           version + "\n");
      failed = true;
      return;
    }

    // Add a message to the update logs to show the user what we have done.
    if ( _.contains(options.args, packageName)) {
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

  // Remove the versions that don't exist
  var removed = _.difference(_.keys(versions), _.keys(newVersions));
  _.each(removed, function(packageName) {
    process.stdout.write("  removed dependency on " + packageName + "\n");
  });

  // Log that we removed the constraints. It is possible that there are
  // constraints that we officially removed that the project still 'depends' on,
  // which is why there are these two tiers of error messages.
  _.each(options.args, function (packageName) {
      process.stdout.write("Removed constraint " + packageName + " from project \n");
  });

  return 0;
});


///////////////////////////////////////////////////////////////////////////////
// bundle
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'bundle',
  minArgs: 1,
  maxArgs: 1,
  requiresApp: true,
  options: {
    debug: { type: Boolean },
    directory: { type: Boolean },
    // Undocumented
    'for-deploy': { type: Boolean }
  }
}, function (options) {
  // XXX if they pass a file that doesn't end in .tar.gz or .tgz, add
  // the former for them

  // XXX output, to stderr, the name of the file written to (for human
  // comfort, especially since we might change the name)

  // XXX name the root directory in the bundle based on the basename
  // of the file, not a constant 'bundle' (a bit obnoxious for
  // machines, but worth it for humans)

  var buildDir = path.join(options.appDir, '.meteor', 'local', 'build_tar');
  var outputPath = path.resolve(options.args[0]); // get absolute path
  var bundlePath = options['directory'] ?
      outputPath : path.join(buildDir, 'bundle');

  var bundler = require(path.join(__dirname, 'bundler.js'));
  var loader = project.getPackageLoader();
  stats.recordPackages(options.appDir);

  var bundleResult = bundler.bundle({
    outputPath: bundlePath,
    nodeModulesMode: options['for-deploy'] ? 'skip' : 'copy',
    buildOptions: {
      minify: ! options.debug,
      arch: XXX_DEPLOY_ARCH  // XXX should do this in deploy instead but it's easier to test with bundle
    }
  });
  if (bundleResult.errors) {
    process.stdout.write("Errors prevented bundling:\n");
    process.stdout.write(bundleResult.errors.formatMessages());
    return 1;
  }

  if (!options['directory']) {
    try {
      files.createTarball(path.join(buildDir, 'bundle'), outputPath);
    } catch (err) {
      console.log(JSON.stringify(err));
      process.stderr.write("Couldn't create tarball\n");
    }
  }
  files.rm_recursive(buildDir);
});

///////////////////////////////////////////////////////////////////////////////
// mongo
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'mongo',
  maxArgs: 1,
  options: {
    url: { type: Boolean, short: 'U' }
  },
  requiresApp: function (options) {
    return options.args.length === 0;
  }
}, function (options) {
  var mongoUrl;
  var usedMeteorAccount = false;

  if (options.args.length === 0) {
    // localhost mode
    var findMongoPort =
      require('./run-mongo.js').findMongoPort;
    var mongoPort = findMongoPort(options.appDir);

    // XXX detect the case where Meteor is running, but MONGO_URL was
    // specified?

    if (! mongoPort) {
      process.stdout.write(
"mongo: Meteor isn't running a local MongoDB server.\n" +
"\n" +
"This command only works while Meteor is running your application\n" +
"locally. Start your application first. (This error will also occur if\n" +
"you asked Meteor to use a different MongoDB server with $MONGO_URL when\n" +
"you ran your application.)\n" +
"\n" +
"If you're trying to connect to the database of an app you deployed\n" +
"with 'meteor deploy', specify your site's name with this command.\n"
);
      return 1;
    }
    mongoUrl = "mongodb://127.0.0.1:" + mongoPort + "/meteor";

  } else {
    // remote mode
    var site = qualifySitename(options.args[0]);
    config.printUniverseBanner();

    if (hostedWithGalaxy(site)) {
      var deployGalaxy = require('./deploy-galaxy.js');
      mongoUrl = deployGalaxy.temporaryMongoUrl(site);
    } else {
      mongoUrl = deploy.temporaryMongoUrl(site);
      usedMeteorAccount = true;
    }

    if (! mongoUrl)
      // temporaryMongoUrl() will have printed an error message
      return 1;
  }
  if (options.url) {
    console.log(mongoUrl);
  } else {
    if (usedMeteorAccount)
      auth.maybePrintRegistrationLink();
    process.stdin.pause();
    var runMongo = require('./run-mongo.js');
    runMongo.runMongoShell(mongoUrl);
    throw new main.WaitForExit;
  }
});

///////////////////////////////////////////////////////////////////////////////
// reset
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'reset',
  // Doesn't actually take an argument, but we want to print an custom
  // error message if they try to pass one.
  maxArgs: 1,
  requiresApp: true
}, function (options) {
  if (options.args.length !== 0) {
    process.stderr.write(
"meteor reset only affects the locally stored database.\n" +
"\n" +
"To reset a deployed application use\n" +
"  meteor deploy --delete appname\n" +
"followed by\n" +
"  meteor deploy appname\n");
    return 1;
  }

  // XXX detect the case where Meteor is running the app, but
  // MONGO_URL was set, so we don't see a Mongo process

  var findMongoPort =
    require(path.join(__dirname, 'run-mongo.js')).findMongoPort;
  var isRunning = !! findMongoPort(options.appDir);
  if (isRunning) {
    process.stderr.write(
"reset: Meteor is running.\n" +
"\n" +
"This command does not work while Meteor is running your application.\n" +
"Exit the running Meteor development server.\n");
    return 1;
  }

  var localDir = path.join(options.appDir, '.meteor', 'local');
  files.rm_recursive(localDir);

  process.stdout.write("Project reset.\n");
});

///////////////////////////////////////////////////////////////////////////////
// deploy
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'deploy',
  minArgs: 1,
  maxArgs: 1,
  options: {
    'delete': { type: Boolean, short: 'D' },
    debug: { type: Boolean },
    settings: { type: String },
    star: { type: String },
    // No longer supported, but we still parse it out so that we can
    // print a custom error message.
    password: { type: String },
    // Shouldn't be documented until the Galaxy release. Marks the
    // application as an admin app, so that it will be available in
    // Galaxy admin interface.
    admin: { type: Boolean }
  },
  requiresApp: function (options) {
    return options.delete || options.star ? false : true;
  }
}, function (options) {
  var site = qualifySitename(options.args[0]);
  config.printUniverseBanner();
  var useGalaxy = hostedWithGalaxy(site);
  var deployGalaxy;

  if (options.delete) {
    if (useGalaxy) {
      deployGalaxy = require('./deploy-galaxy.js');
      return deployGalaxy.deleteApp(site);
    } else {
      return deploy.deleteApp(site);
    }
  }

  if (options.password) {
    if (useGalaxy) {
      process.stderr.write("Galaxy does not support --password.\n");
    } else {
      process.stderr.write(
"Setting passwords on apps is no longer supported. Now there are\n" +
"user accounts and your apps are associated with your account so that\n" +
"only you (and people you designate) can access them. See the\n" +
"'meteor claim' and 'meteor authorized' commands.\n");
    }
    return 1;
  }

  var starball = options.star;
  if (starball && ! useGalaxy) {
    // XXX it would be nice to support this for non-Galaxy deploys too
    process.stderr.write(
"--star: only supported when deploying to Galaxy.\n");
    return 1;
  }

  var loggedIn = auth.isLoggedIn();
  if (! loggedIn) {
    process.stderr.write(
"To instantly deploy your app on a free testing server, just enter your\n" +
"email address!\n" +
"\n");

    if (! auth.registerOrLogIn())
      return 1;
  }

  var buildOptions = {
    minify: ! options.debug
  };

  var deployResult;
  if (useGalaxy) {
    deployGalaxy = require('./deploy-galaxy.js');
    deployResult = deployGalaxy.deploy({
      app: site,
      appDir: options.appDir,
      settingsFile: options.settings,
      starball: starball,
      buildOptions: buildOptions,
      admin: options.admin
    });
  } else {
    deployResult = deploy.bundleAndDeploy({
      appDir: options.appDir,
      site: site,
      settingsFile: options.settings,
      buildOptions: buildOptions
    });
  }

  if (deployResult === 0) {
    auth.maybePrintRegistrationLink({
      leadingNewline: true,
      // If the user was already logged in at the beginning of the
      // deploy, then they've already been prompted to set a password
      // at least once before, so we use a slightly different message.
      firstTime: ! loggedIn
    });
  }

  return deployResult;
});

///////////////////////////////////////////////////////////////////////////////
// logs
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'logs',
  minArgs: 1,
  maxArgs: 1,
  options: {
    // XXX once Galaxy is released, document this
    stream: { type: Boolean, short: 'f' }
  }
}, function (options) {
  var site = qualifySitename(options.args[0]);

  if (hostedWithGalaxy(site)) {
    var deployGalaxy = require('./deploy-galaxy.js');
    var ret = deployGalaxy.logs({
      app: site,
      streaming: options.stream
    });
    if (options.stream && ret === null)
      throw new main.WaitForExit;
    return ret;
  } else {
    return deploy.logs(site);
  }
});

///////////////////////////////////////////////////////////////////////////////
// authorized
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'authorized',
  minArgs: 1,
  maxArgs: 1,
  options: {
    add: { type: String, short: "a" },
    remove: { type: String, short: "r" },
    list: { type: Boolean }
  }
}, function (options) {

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

  config.printUniverseBanner();
  auth.pollForRegistrationCompletion();
  var site = qualifySitename(options.args[0]);

  if (hostedWithGalaxy(site)) {
    process.stderr.write(
"Sites hosted on Galaxy do not have an authorized user list.\n" +
"Instead, go to your Galaxy dashboard to change the authorized users\n" +
"of your Galaxy.\n");
    return 1;
  }

  if (! auth.isLoggedIn()) {
    process.stderr.write(
      "You must be logged in for that. Try 'meteor login'.\n");
    return 1;
  }

  if (options.add)
    return deploy.changeAuthorized(site, "add", options.add);
  else if (options.remove)
    return deploy.changeAuthorized(site, "remove", options.remove);
  else
    return deploy.listAuthorized(site);
});

///////////////////////////////////////////////////////////////////////////////
// claim
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'claim',
  minArgs: 1,
  maxArgs: 1
}, function (options) {
  config.printUniverseBanner();
  auth.pollForRegistrationCompletion();
  var site = qualifySitename(options.args[0]);

  if (! auth.isLoggedIn()) {
    process.stderr.write(
"You must be logged in to claim sites. Use 'meteor login' to log in.\n" +
"If you don't have a Meteor developer account yet, create one by clicking\n" +
"'Sign in' and then 'Create account' at www.meteor.com.\n\n");
    return 1;
  }

  if (hostedWithGalaxy(site)) {
    process.stderr.write(
      "Sorry, you can't claim sites that are hosted on Galaxy.\n");
    return 1;
  }

  return deploy.claim(site);
});


///////////////////////////////////////////////////////////////////////////////
// test-packages
///////////////////////////////////////////////////////////////////////////////

//
// Test your local packages.
//
main.registerCommand({
  name: 'test-packages',
  maxArgs: Infinity,
  options: {
    port: { type: Number, short: "p", default: 3000 },
    deploy: { type: String },
    production: { type: Boolean },
    settings: { type: String },
    // Undocumented. See #Once
    once: { type: Boolean },
    // Undocumented. To ensure that QA covers both
    // PollingObserveDriver and OplogObserveDriver, this option
    // disables oplog for tests.  (It still creates a replset, it just
    // doesn't do oplog tailing.)
    'disable-oplog': { type: Boolean },
    // Undocumented flag to use a different test driver.
    'driver-package': { type: String }
  }
}, function (options) {
  var testPackages;
  var localPackageNames = [];
  if (options.args.length === 0) {
    // Only test local packages if no package is specified.
    var packageList = getLocalPackages();
    if (! packageList) {
      // Couldn't load the package list, probably because some package
      // has a parse error. Bail out -- this kind of sucks; we would
      // like to find a way to get reloading.
      return 1;
    }
    testPackages = _.keys(packageList);
  } else {
    var messages = buildmessage.capture(function () {
      testPackages = _.map(options.args, function (p) {
        // If it's a package name, just pass it through.
        if (p.indexOf('/') === -1) {
          if (p.indexOf('@') !== -1) {
            buildmessage.error(
              "You may not specify versions for local packages: " + p );
            // Recover by returning p anyway.
          }
          return p;
        }

        // Otherwise it's a directory; load it into a Package now. Use
        // path.resolve to strip trailing slashes, so that packageName doesn't
        // have a trailing slash.
        //
        // Why use addLocalPackage instead of just loading the packages
        // and passing Unipackage objects to the bundler? Because we
        // actually need the Catalog to know about the package, so that
        // we are able to resolve the test package's dependency on the
        // main package. This is not ideal (I hate how this mutates global
        // state) but it'll do for now.
        var packageDir = path.resolve(p);
        var packageName = path.basename(packageDir);
        catalog.complete.addLocalPackage(packageName, packageDir);
        localPackageNames.push(packageName);
        return packageName;
      });
    });

    if (messages.hasMessages()) {
      process.stdout.write("\n" + messages.formatMessages());
      return 1;
    }
  }

  // Make a temporary app dir (based on the test runner app). This will be
  // cleaned up on process exit. Using a temporary app dir means that we can
  // run multiple "test-packages" commands in parallel without them stomping
  // on each other.
  //
  // Note: testRunnerAppDir deliberately DOES NOT MATCH the app
  // package search path baked into release.current.catalog: we are
  // bundling the test runner app, but finding app packages from the
  // current app (if any).
  var testRunnerAppDir = files.mkdtemp('meteor-test-run');
  files.cp_r(path.join(__dirname, 'test-runner-app'), testRunnerAppDir);

  // We are going to operate in the special test project, so let's remap our
  // main project to the test directory.
  project.setRootDir(testRunnerAppDir);
  project.writeMeteorReleaseVersion(release.current.name || 'none');
  project.forceEditPackages(
    [options['driver-package'] || 'test-in-browser'],
    'add');

  // When we test packages, we need to know their versions and all of their
  // dependencies. We are going to add them to the project and have the project
  // compute them for us. This means that right now, we are testing all packages
  // as they work together.
  var tests = [];
  _.each(testPackages, function(name) {
    var versionRecord = catalog.complete.getLatestVersion(name);
    if (versionRecord && versionRecord.testName) {
      tests.push(versionRecord.testName);
    }
  });

  project.forceEditPackages(tests, 'add');

  var buildOptions = {
    minify: options.production
  };

  var ret;
  if (options.deploy) {
    ret = deploy.bundleAndDeploy({
      appDir: testRunnerAppDir,
      site: options.deploy,
      settingsFile: options.settings,
      buildOptions: buildOptions
    });
  } else {
    var runAll = require('./run-all.js');
    ret = runAll.run(testRunnerAppDir, {
      // if we're testing packages from an app, we still want to make
      // sure the user doesn't 'meteor update' in the app, requiring
      // a switch to a different release
      appDirForVersionCheck: options.appDir,
      proxyPort: options.port,
      disableOplog: options['disable-oplog'],
      settingsFile: options.settings,
      banner: "Tests",
      buildOptions: buildOptions,
      rootUrl: process.env.ROOT_URL,
      mongoUrl: process.env.MONGO_URL,
      oplogUrl: process.env.MONGO_OPLOG_URL,
      once: options.once
    });
  }

  _.each(localPackageNames, function (name) {
    catalog.complete.removeLocalPackage(name);
  });

  return ret;
});

///////////////////////////////////////////////////////////////////////////////
// rebuild
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'rebuild',
  maxArgs: Infinity,
  hidden: true
}, function (options) {
  var messages;
  var count = 0;
  // No packages specified. Rebuild everything.
  if (options.args.length === 0) {
    if (options.appDir) {
      // The catalog doesn't know about other programs in your app. Let's blow
      // away their .build directories if they have them, and not rebuild
      // them. Sort of hacky, but eh.
      var programsDir = project.getProgramsDirectory();
      var programsSubdirs = project.getProgramsSubdirs();
      _.each(programsSubdirs, function (program) {
        // The implementation of this part of the function might change once we
        // change the control file format to explicitly specify packages and
        // programs instead of just loading everything in the programs directory?
        files.rm_recursive(path.join(programsDir, program, '.build.' + program));
      });
    }

    messages = buildmessage.capture(function () {
      count = catalog.complete.rebuildLocalPackages();
    });
  } else {
    messages = buildmessage.capture(function () {
      // Initialize a new package loader, but only for local packages (since we
      // are not going to rebuild non-local packages.)
      var loader = new PackageLoader({
          versions: null,
       });

      _.each(options.args, function (p) {
        // Let's remove the old unipackage directory first.
        var packpath = catalog.complete.getLoadPathForPackage(p, null);
        files.rm_recursive(path.join(packpath, ".build."+p));
        console.log(path.join(packpath, ".build."+p));

        // Getting the package from the package loader will cause it to be
        // rebuilt if it is not built (which it isn't, since we just deleted the
        // unipackage).
        loader.getPackage(p);
        count++;
      });
    });
  }
  if (count)
    console.log("Built " + count + " packages.");
  if (messages.hasMessages()) {
    process.stdout.write("\n" + messages.formatMessages());
    return 1;
  }
});

///////////////////////////////////////////////////////////////////////////////
// login
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'login',
  options: {
    email: { type: String },
    // Undocumented: get credentials on a specific Galaxy. Do we still
    // need this?
    galaxy: { type: String }
  }
}, function (options) {
  return auth.loginCommand(_.extend({
    overwriteExistingToken: true
  }, options));
});


///////////////////////////////////////////////////////////////////////////////
// logout
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'logout'
}, function (options) {
  return auth.logoutCommand(options);
});


///////////////////////////////////////////////////////////////////////////////
// whoami
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'whoami'
}, function (options) {
  return auth.whoAmICommand(options);
});

///////////////////////////////////////////////////////////////////////////////
// admin make-bootstrap-tarballs
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'admin make-bootstrap-tarballs',
  minArgs: 2,
  maxArgs: 2
}, function (options) {
  var releaseNameAndVersion = options.args[0];
  var outputDirectory = options.args[1];

  // In this function, we want to use the official catalog everywhere, because
  // we assume that all packages have been published (along with the release
  // obviously) and we want to be sure to only bundle the published versions.
  catalog.official.refresh();

  var parsed = utils.splitConstraint(releaseNameAndVersion);
  if (!parsed.constraint)
    throw new main.ShowUsage;

  var release = catalog.official.getReleaseVersion(parsed.package,
                                                parsed.constraint);
  if (!release) {
    // XXX this could also mean package unknown.
    process.stderr.write('Release unknown: ' + releaseNameAndVersion + '\n');
    return 1;
  }

  var toolPkg = release.tool && utils.splitConstraint(release.tool);
  if (! (toolPkg && toolPkg.constraint))
    throw new Error("bad tool in release: " + toolPkg);
  var toolPkgBuilds = catalog.official.getAllBuilds(
    toolPkg.package, toolPkg.constraint);
  if (!toolPkgBuilds) {
    // XXX this could also mean package unknown.
    process.stderr.write('Tool version unknown: ' + release.tool + '\n');
    return 1;
  }
  if (!toolPkgBuilds.length) {
    process.stderr.write('Tool version has no builds: ' + release.tool + '\n');
    return 1;
  }

  // XXX check to make sure this is the three arches that we want? it's easier
  // during 0.9.0 development to allow it to just decide "ok, i just want to
  // build the OSX tarball" though.
  var buildArches = _.pluck(toolPkgBuilds, 'architecture');
  var osArches = _.map(buildArches, function (buildArch) {
    var subArches = buildArch.split('+');
    var osArches = _.filter(subArches, function (subArch) {
      return subArch.substr(0, 3) === 'os.';
    });
    if (osArches.length !== 1) {
      throw Error("build architecture " + buildArch + "  lacks unique os.*");
    }
    return osArches[0];
  });

  process.stderr.write(
    'Building bootstrap tarballs for architectures ' +
      osArches.join(', ') + '\n');
  // Before downloading anything, check that the catalog contains everything we
  // need for the OSes that the tool is built for.
  _.each(osArches, function (osArch) {
    _.each(release.packages, function (pkgVersion, pkgName) {
      if (!catalog.official.getBuildsForArches(pkgName, pkgVersion, [osArch])) {
        throw Error("missing build of " + pkgName + "@" + pkgVersion +
                    " for " + osArch);
      }
    });
  });

  files.mkdir_p(outputDirectory);

  _.each(osArches, function (osArch) {
    var tmpdir = files.mkdtemp();
    // We're going to build and tar up a tropohouse in a temporary directory; we
    // don't want to use any of our local packages, so we use catalog.official
    // instead of catalog.
    // XXX update to '.meteor' when we combine houses
    var tmpTropo = new tropohouse.Tropohouse(
      path.join(tmpdir, '.meteor0'), catalog.official);
    tmpTropo.maybeDownloadPackageForArchitectures(
      {packageName: toolPkg.package, version: toolPkg.constraint},
      [osArch]);  // XXX 'browser' too?
    _.each(release.packages, function (pkgVersion, pkgName) {
      tmpTropo.maybeDownloadPackageForArchitectures(
        {packageName: pkgName, version: pkgVersion},
        [osArch]);  // XXX 'browser' too?
    });

    // Delete the downloaded-builds directory which basically just has a second
    // copy of everything.  I think it's OK if the first time we try to deploy
    // to Linux from Mac, it has to download a bunch of stuff.  (Alternatively,
    // we could actually always include Linux64 in the bootstrap tarball, but
    // meh.)
    // XXX it's not like cross-linking even works yet anyway
    files.rm_recursive(path.join(tmpTropo.root, 'downloaded-builds'));

    // XXX should we include some sort of preliminary package-metadata as well?
    // maybe with release info about the release we are using?

    // Create the top-level 'meteor' symlink, which links to the latest tool's
    // meteor shell script.
    var toolUnipackagePath =
          tmpTropo.packagePath(toolPkg.package, toolPkg.constraint);
    var toolUnipackage = new unipackage.Unipackage;
    toolUnipackage.initFromPath(toolPkg.package, toolUnipackagePath);
    var toolRecord = _.findWhere(toolUnipackage.toolsOnDisk, {arch: osArch});
    if (!toolRecord)
      throw Error("missing tool for " + osArch);
    fs.symlinkSync(
      path.join(
        tmpTropo.packagePath(toolPkg.package, toolPkg.constraint, true),
        toolRecord.path,
        'meteor'),
      path.join(tmpTropo.root, 'meteor'));

    files.createTarball(
      tmpTropo.root,
      path.join(outputDirectory, 'meteor-bootstrap-' + osArch + '.tar.gz'));
  });

  return 0;
});

///////////////////////////////////////////////////////////////////////////////
// admin set-banners
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'admin set-banners',
  minArgs: 1,
  maxArgs: 1
}, function (options) {
  var bannersFile = options.args[0];
  try {
    var bannersData = fs.readFileSync(bannersFile, 'utf8');
    bannersData = JSON.parse(bannersData);
  } catch (e) {
    process.stderr.write("Could not parse banners file: ");
    process.stderr.write(e.message + "\n");
    return 1;
  }
  if (!bannersData.track) {
    process.stderr.write("Banners file should have a 'track' key.\n");
    return 1;
  }
  if (!bannersData.banners) {
    process.stderr.write("Banners file should have a 'banners' key.\n");
    return 1;
  }

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  conn.call('setBannersOnReleases', bannersData.track,
            bannersData.banners);

  // Refresh afterwards.
  catalog.official.refresh();
  return 0;
});

///////////////////////////////////////////////////////////////////////////////
// self-test
///////////////////////////////////////////////////////////////////////////////

// XXX we should find a way to make self-test fully self-contained, so that it
// ignores "packageDirs" (ie, it shouldn't fail just because you happen to be
// sitting in an app with packages that don't build)

main.registerCommand({
  name: 'self-test',
  minArgs: 0,
  maxArgs: 1,
  options: {
    changed: { type: Boolean },
    'force-online': { type: Boolean },
    slow: { type: Boolean },
    history: { type: Number }
  },
  hidden: true
}, function (options) {
  var selftest = require('./selftest.js');

  // Auto-detect whether to skip 'net' tests, unless --force-online is passed.
  var offline = false;
  if (!options['force-online']) {
    try {
      require('./http-helpers.js').getUrl("http://www.google.com/");
    } catch (e) {
      if (e instanceof files.OfflineError)
        offline = true;
    }
  }

  var testRegexp = undefined;
  if (options.args.length) {
    try {
      testRegexp = new RegExp(options.args[0]);
    } catch (e) {
      if (!(e instanceof SyntaxError))
        throw e;
      process.stderr.write("Bad regular expression: " + options.args[0] + "\n");
      return 1;
    }
  }

  return selftest.runTests({
    onlyChanged: options.changed,
    offline: offline,
    includeSlowTests: options.slow,
    historyLines: options.history,
    testRegexp: testRegexp
  });
});

///////////////////////////////////////////////////////////////////////////////
// list-sites
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'list-sites',
  minArgs: 0,
  maxArgs: 0
}, function (options) {
  auth.pollForRegistrationCompletion();
  if (! auth.isLoggedIn()) {
    process.stderr.write(
      "You must be logged in for that. Try 'meteor login'.\n");
    return 1;
  }

  return deploy.listSites();
});

///////////////////////////////////////////////////////////////////////////////
// dummy
///////////////////////////////////////////////////////////////////////////////

// Dummy test command. Used for automated testing of the command line
// option parser.

main.registerCommand({
  name: 'dummy',
  options: {
    email: { type: String, short: "e", required: true },
    port: { type: Number, short: "p", default: 3000 },
    url: { type: Boolean, short: "U" },
    'delete': { type: Boolean, short: "D" },
    changed: { type: Boolean }
  },
  maxArgs: 2,
  hidden: true
}, function (options) {
  var p = function (key) {
    if (_.has(options, key))
      return JSON.stringify(options[key]);
    return 'none';
  };

  process.stdout.write(p('email') + " " + p('port') + " " + p('changed') +
                       " " + p('args') + "\n");
  if (options.url)
    process.stdout.write('url\n');
  if (options['delete'])
    process.stdout.write('delete\n');
});
