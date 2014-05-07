var main = require('./main.js');
var path = require('path');
var _ = require('underscore');
var fs = require("fs");
var files = require('./files.js');
var deploy = require('./deploy.js');
var buildmessage = require('./buildmessage.js');
var uniload = require('./uniload.js');
var project = require('./project.js');
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
var PackageLoader = require('./package-loader.js');
var PackageSource = require('./package-source.js');
var compiler = require('./compiler.js');
var catalog = require('./catalog.js').catalog;

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

  var names = catalog.getAllPackageNames();
  _.each(names, function (name) {
    if (catalog.isLocalPackage(name)) {
      ret[name] = catalog.getLatestVersion(name);
    }
  });

  return ret;
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

  // First, generate a package loader. This will also have the side effect of
  // processing our dependencies and rewriting the versions file, but
  // regardless, we are going to need it to compile packages.
  var loader = project.generatePackageLoader(options.appDir);

  // Then get the list of packages that we need to get and build.
  var allPackages = project.getIndirectDependencies(options.appDir);

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
    var appRelease = project.getMeteorReleaseVersion(options.appDir);
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
    example: { type: String }
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
      ! release.forced)
    throw new main.SpringboardToLatestRelease;

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

  project.writeMeteorReleaseVersion(
    appPath, release.current.isCheckout() ? "none" : release.current.name);

  process.stderr.write(appPath + ": created");
  if (options.example && options.example !== appPath)
    process.stderr.write(" (from '" + options.example + "' template)");
  process.stderr.write(".\n\n");

  process.stderr.write(
    "To run your new app:\n" +
      "   cd " + appPath + "\n" +
      "   meteor\n");
});

///////////////////////////////////////////////////////////////////////////////
// update
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'update',
  options: {
    // Undocumented flag used by upgrade-to-engine.sh for updating
    // from prehistoric versions of Meteor. Ignoring it should be
    // harmless. We should remove it eventually.
    'dont-fetch-latest': { type: Boolean }
  },
  // We have to be able to work without a release, since 'meteor
  // update' is how you fix apps that don't have a release.
  requiresRelease: false
}, function (options) {

  // Refresh the catalog, cacheing the remote package data on the server.
  catalog.catalog.refresh(true);

  // refuse to update if we're in a git checkout.
  if (! files.usesWarehouse()) {
    process.stderr.write(
      "update: can only be run from official releases, not from checkouts\n");
    return 1;
  }

  var couldNotContactServer = false;

  // Unless --release was passed (meaning that either the user asked for a
  // particular release, or that we _just did_ this and springboarded at
  // #UpdateSpringboard), go get the latest release and switch to it.
  if (! release.forced) {
    try {
      warehouse.fetchLatestRelease({showInstalling: true});
    } catch (e) {
      if (! (e instanceof files.OfflineError)) {
        console.error("Failed to update Meteor.");
        throw e;
      }
      // If the problem appears to be that we're offline, just log and
      // continue.
      console.log("Can't contact the update server. Are you online?");
      couldNotContactServer = true;
    }

    if (! release.current ||
        release.current.name !== release.latestDownloaded()) {
      // The user asked for the latest release (well, they "asked for it" by not
      // passing --release). We're not currently running the latest release (we
      // may have even just downloaded it).  #UpdateSpringboard
      //
      // (We used to springboard only if the tools version actually
      // changed between the old and new releases. Now we do it
      // unconditionally, because it's not a big deal to do it and it
      // eliminates the complexity of the current release changing.)
      throw new main.SpringboardToLatestRelease;
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
    if (release.forced) {
      // We get here if:
      // 1) the user ran 'meteor update' and we found a new version
      // 2) the user ran 'meteor update --release xyz' (regardless of
      //    whether we found a new release)
      //
      // In case (1), we downloaded and installed the update and then
      // we springboarded (at #UpdateSpringboard above), causing
      // release.forced to be true.
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
  var appRelease = project.getMeteorReleaseVersion(options.appDir);
  if (appRelease !== null && appRelease === release.current.name) {
    // Note that in this case, release.forced is true iff --release was actually
    // passed on the command-line: #UpdateSpringboard can't have occured.  Why?
    // Well, if the user didn't specify --release but we're in an app, then
    // release.current.name must have been taken from the app, and
    // #UpdateSpringboard only happens if needs to try to change the app
    // release, and this is the message for not needing to change the release.
    var maybeTheLatestRelease = release.forced ? "" : ", the latest release";
    var maybeOnThisComputer =
          couldNotContactServer ? "\ninstalled on this computer" : "";
    console.log(
"This project is already at Meteor %s%s%s.",
      appRelease, maybeTheLatestRelease, maybeOnThisComputer);
    return;
  }

  // Find upgraders (in order) necessary to upgrade the app for the new
  // release (new metadata file formats, etc, or maybe even updating renamed
  // APIs).
  //
  // * If this is a pre-engine app with no .meteor/release file, run
  //   all upgraders.
  // * If the app didn't have a release because it was created by a
  //   checkout, don't run any upgraders.
  //
  // We're going to need the list of upgraders from the old release
  // (the release the app was using previously) to decide what
  // upgraders to run. It's possible that we don't have it downloaded
  // yet (if they checked out the project and immediately ran 'meteor
  // update --release foo'), so it's important to do this before we
  // actually update the project.
  var upgradersToRun;
  if (appRelease === "none") {
    upgradersToRun = [];
  } else {
    var oldUpgraders;

    if (appRelease === null) {
      oldUpgraders = [];
    } else {
      try {
        var oldRelease = release.load(appRelease);
      } catch (e) {
        if (e instanceof files.OfflineError) {
          process.stderr.write(
"You need to be online to do this. Please check your internet connection.\n");
          return 1;
        }
        if (e instanceof warehouse.NoSuchReleaseError) {
          // In this situation it's tempting to just print a warning and
          // skip the updaters, but I can't figure out how to explain
          // what's happening to the user, so let's just do this.
          process.stderr.write(
"This project says that it uses version " + appRelease + " of Meteor, but you\n" +
"don't have that version of Meteor installed and the Meteor update servers\n" +
"don't have it either. Please edit the .meteor/release file in the project\n" +
"project and change it to a valid Meteor release.\n");
          return 1;
        }
        throw e;
      }
      oldUpgraders = oldRelease.getUpgraders();
    }

    upgradersToRun = _.difference(release.current.getUpgraders(), oldUpgraders);
  }

  // Write the release to .meteor/release.
  project.writeMeteorReleaseVersion(options.appDir, release.current.name);

  // Now run the upgraders.
  _.each(upgradersToRun, function (upgrader) {
    require("./upgraders.js").runUpgrader(upgrader, options.appDir);
  });

  // This is the right spot to do any other changes we need to the app in
  // order to update it for the new release.

  console.log("%s: updated to Meteor %s.",
              path.basename(options.appDir), release.current.name);

  // Print any notices relevant to this upgrade.
  // XXX This doesn't include package-specific notices for packages that
  // are included transitively (eg, packages used by app packages).
  var packages = project.getPackages(options.appDir);
  warehouse.printNotices(appRelease, release.current.name, packages);
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
  upgraders.runUpgrader(upgrader, options.appDir);
});

///////////////////////////////////////////////////////////////////////////////
// add
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'add',
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true
}, function (options) {

  var failed = false;

  // Refresh the catalog, cacheing the remote package data on the server.
  catalog.refresh(true);

  // Read in existing package dependencies.
  var packages = project.getDirectDependencies(options.appDir);

  // For every package name specified, add it to our list of package
  // constraints. Don't run the constraint solver until you have added all of
  // them -- add should be an atomic operation regardless of the package
  // order. Even though the package file should specify versions of its inputs,
  // we don't specify these constraints until we get them back from the
  // constraint solver.
  var constraints = _.map(options.args, function (packageReq) {
    return utils.splitConstraint(packageReq.toLowerCase());
  });

  _.each(constraints, function (constraint) {
    // Check that the package exists.
    if (! catalog.getPackage(constraint.package)) {
      process.stderr.write(constraint.package + ": no such package\n");
      failed = true;
      return;
    }

    // If the version was specified, check that the version exists.
    if ( constraint.constraint !== "none") {
      var versionInfo = catalog.getVersion(
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
    if (_.has(packages.appDeps, constraint.package) &&
        packages.appDeps[constraint.package] === constraint.constraint) {
      process.stderr.write(constraint.package + " with version constraint " +
                           constraint.constraint + " has already been added.\n");
      failed = true;
    }

    // Add the package to our direct dependency constraints that we get from .meteor/packages.
    packages.appDeps[constraint.package] = constraint.constraint;
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
  var versions = project.getIndirectDependencies(options.appDir);

  // Call the constraint solver.
  var constraintSolver = require('./constraint-solver.js');
  var resolver = new constraintSolver.Resolver;
  // Combine into one object mapping package name to list of
  // constraints, to pass in to the constraint solver.
  var allPackages = project.combineAppAndProgramDependencies(packages);
  // XXX: constraint solver currently ignores versions, but it should not.
  // XXX: this would also be the place to add no-update options.
  var newVersions = resolver.resolve(allPackages);
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

  // Install the new versions. If all new versions were installed
  // successfully, then `setDependencies` also records dependency
  // changes in the .meteor/versions file.
  //
  // Makes sure we have enough builds of the package downloaded such that
  // we can load a browser build and a build that will run on this
  // system. (Later we may also need to download more builds to be able to
  // deploy to another architecture.)
  var downloaded = project.setDependencies(
    options.appDir,
    packages.appDeps,
    newVersions
  );

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
      messageLog.push("upgraded " + packageName + " from version " +
                      versions[packageName] +
                      " to version " + newVersions[packageName]);
    } else {
      messageLog.push("added " + packageName +
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
    var versionRecord = catalog.getVersion(constraint.package, version);
    if (constraint.constraint !== "none" &&
        version !== constraint.constraint) {
      process.stdout.write("Added " + constraint.package + " at version " + version +
                           " to avoid conflicting dependencies.");
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
  catalog.refresh(true);

  // Read in existing package dependencies.
  var packages = project.getDirectDependencies(options.appDir);

  // For every package name specified, add it to our list of package
  // constraints. Don't run the constraint solver until you have added all of
  // them -- add should be an atomic operation regardless of the package
  // order. Even though the package file should specify versions of its inputs,
  // we don't specify these constraints until we get them back from the
  // constraint solver.
  _.each(options.args, function (packageName) {
    // Check that we are using the package. We don't check if the package
    // exists. You should be able to remove non-existent packages.
    if (! _.has(packages.appDeps, packageName)) {
      process.stderr.write( packageName  + " is not in this project \n");
    }

    // Remove the package from our dependency list.
    delete packages.appDeps[packageName];
  });

  // Get the contents of our versions file. We need to pass them to the
  // constraint solver, because our contract with the user says that we will
  // never downgrade a dependency.
  var versions = project.getIndirectDependencies(options.appDir);

  // Call the constraint solver.
  var constraintSolver = require('./constraint-solver.js');
  var resolver = new constraintSolver.Resolver;
  // XXX: constraint solver currently ignores versions, but it should not.
  // XXX: this would also be the place to add no-update options.
  var newVersions = resolver.resolve(
    project.combineAppAndProgramDependencies(packages));
  if ( ! newVersions) {
    // This should never really happen.
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

  // Write the dependency files with the right versions
  project.setDependencies(options.appDir, packages.appDeps, newVersions);

  // Show the user the messageLog of everything we removed.
  _.each(messageLog, function (msg) {
    process.stdout.write(msg + "\n");
  });

  // Log that we removed everything. It is possible to remove a project
  // dependency that is still in .meteor/versions because other packages depend
  // on it, so overlap with removed is not guaranteed.
  _.each(options.args, function (packageName) {
      process.stdout.write("Removed " + packageName + " from project \n");
  });

  return 0;
});

///////////////////////////////////////////////////////////////////////////////
// list
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'list',
  requiresApp: function (options) {
    return options.using;
  },
  options: {
    using: { type: Boolean },
    releases: { type: Boolean }
  }
}, function (options) {
  var items = [];

  // Refresh the catalog, checking the remote package data on the server. If we
  // are only calling 'using', this is not nessessary, but, once again, as a
  // user, I would not be surprised to see this contact the server. In the
  // future, we should move this call to sync somewhere in the background.
  catalog.refresh(true);

  if (options.releases && options.using) {
     console.log("XXX: The contents of your release file.");
  } else if (options.releases) {
    // XXX: We probably want the recommended version rather than all of them,
    // but for now, let's just display some stuff to make sure that it worked.
    _.each(catalog.getAllReleaseTracks(), function (name) {
      var versions = catalog.getReleaseVersions(name);
      _.each(versions, function (version) {
        var versionInfo = catalog.getReleaseVersion(name, version);
        if (versionInfo) {
          items.push({ name: name + " " + version, description: versionInfo.description });
        }
      });
    });
  } else if (options.using) {
    // Generate a package loader for this project. This will also compute the
    // nessessary versions and write them to disk.
    project.generatePackageLoader(options.appDir);
    var packages = project.getDirectDependencies(options.appDir);
    var messages = buildmessage.capture(function () {
      _.each(packages.appDeps, function (version, name) {
        //XXX: Now that we don't store the version in the .meteor/packages file,
        //we should read the versions file for the version to use in this
        //description.
        if (version) {
          var versionInfo = catalog.getVersion(name, version);
          if (!versionInfo) {
            buildmessage.error("Cannot process package list. Unknown: " + name +
                             " at version " + version + "\n");
           return;
         }
         items.push({ name: name, description: versionInfo.description });
       }
      });
    });
    if (messages.hasMessages()) {
      process.stdout.write("\n" + messages.formatMessages());
      return 1;
    }
  } else {
    _.each(catalog.getAllPackageNames(), function (name) {
      var versionInfo = catalog.getLatestVersion(name);
      if (versionInfo) {
        items.push({ name: name, description: versionInfo.description });
      }
    });
  }
  process.stdout.write(formatList(items));
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
  var bundlePath = path.join(buildDir, 'bundle');
  var outputPath = path.resolve(options.args[0]); // get absolute path

  var bundler = require(path.join(__dirname, 'bundler.js'));
  var loader = project.generatePackageLoader(options.appDir);
  var bundleResult = bundler.bundle({
    appDir: options.appDir,
    packageLoader: loader,
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

  try {
    files.createTarball(path.join(buildDir, 'bundle'), outputPath);
  } catch (err) {
    console.log(JSON.stringify(err));
    process.stderr.write("Couldn't create tarball\n");
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
"mongo: Meteor isn't running.\n" +
"\n" +
"This command only works while Meteor is running your application\n" +
"locally. Start your application first.\n");
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
    add: { type: String },
    remove: { type: String },
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
        catalog.addLocalPackage(packageName, packageDir);
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
  project.writeMeteorReleaseVersion(testRunnerAppDir,
                                    release.current.name || 'none');
  project.addPackage(testRunnerAppDir,
                     options['driver-package'] || 'test-in-browser');

  // When we test packages, we need to know their versions and all of their
  // dependencies. We are going to add them to the project and have the project
  // compute them for us. This means that right now, we are testing all packages
  // as they work together.
  _.each(testPackages, function(name) {
    var versionRecord = catalog.getLatestVersion(name);
    if (versionRecord && versionRecord.testName) {
      project.addPackage(testRunnerAppDir, versionRecord.testName);
    }
  });

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
    catalog.removeLocalPackage(name);
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
      var programsDir = project.getProgramsDirectory(options.appDir);
      var programsSubdirs = project.getProgramsSubdirs(options.appDir);
      _.each(programsSubdirs, function (program) {
        // The implementation of this part of the function might change once we
        // change the control file format to explicitly specify packages and
        // programs instead of just loading everything in the programs directory?
        files.rm_recursive(path.join(programsDir, program, '.build.' + program));
      });
    }

    messages = buildmessage.capture(function () {
      count = catalog.rebuildLocalPackages();
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
        var packpath = catalog.getLoadPathForPackage(p, null);
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
// admin grant
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'admin grant'
}, function (options) {
  process.stderr.write("'admin grant' command not implemented yet\n");
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
    history: { type: Number },
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
// publish a package
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'publish',
  minArgs: 0,
  maxArgs: 0,
  options: {
    // XXX A temporary option to create the package, until we sync
    // package metadata to the client.
    create: { type: Boolean }
  },
  requiresPackage: true
}, function (options) {

  // Refresh the catalog, caching the remote package data on the server. We can
  // optimize the workflow by using this data to weed out obviously incorrect
  // submissions before they ever hit the wire.
  catalog.refresh(true);

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
      // XXX would be nice to get the name out of the package (while
      // still confirming that it matches the name of the directory)
      var packageName = path.basename(options.packageDir);
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

  compileResult.unipackage.saveToPath(
    path.join(options.packageDir, '.build.' + packageSource.name));

  var name = packageSource.name;
  var version = packageSource.version;

  // Check that the package name is valid.
  if (! utils.validPackageName(name) ) {
    process.stderr.write(
      "Package name invalid. Package names can only contain \n" +
      "lowercase ASCII alphanumerics, dash, and dot, and must contain at least one letter. \n" +
      "Package names cannot begin with a dot. \n");
    return 1;
  }

  // Check that we have a version.
  if (! version) {
    process.stderr.write(
     "That package cannot be published because it doesn't have a version.\n");
    return 1;
  }

  // Check that the version description is under the character limit.
  if (packageSource.metadata.summary.length > 100) {
    process.stderr.write("Description must be under 100 chars.");
    process.stderr.write("Publish failed.");
    return 1;
  }

  // We need to build the test package to get all of its sources.
  var testFiles = [];
  messages = buildmessage.capture(
    { title: "getting test sources" },
    function () {
      var testName = packageSource.testName;
      if (testName) {
        var testSource = new PackageSource;
        testSource.initFromPackageDir(testName, options.packageDir);
        if (buildmessage.jobHasMessages())
          return; // already have errors, so skip the build

        var testUnipackage = compiler.compile(testSource, { officialBuild: true });
        testFiles = testUnipackage.sources;
      }
    });

  if (messages.hasMessages()) {
    process.stdout.write(messages.formatMessages());
    return 1;
  }

  process.stdout.write('Bundling source...\n');

  // XXX prevent people from directly publishing meteor-tool outside of the
  // release publishing process (since we don't automatically rebuild the tool
  // package)

  var sources = _.union(compileResult.sources, testFiles);

  // Send the versions lock file over to the server! We should make sure to use
  // the same version lock file when we build this source elsewhere (ex:
  // publish-for-arch).
  sources.push(packageSource.versionsFileName());
  var bundleResult = packageClient.bundleSource(compileResult.unipackage,
                                                sources,
                                                options.packageDir);

  var compilerInputsHash = compileResult.unipackage.getBuildIdentifier({
    relativeTo: packageSource.sourceRoot
  });

  // Create the package.
  // XXX First sync package metadata and check if it exists.
  if (options.create) {
    process.stdout.write('Creating package...\n');
    var packageId = conn.call('createPackage', {
      name: packageSource.name
    });
  }

  process.stdout.write('Creating package version...\n');
  var uploadRec = {
    packageName: packageSource.name,
    version: version,
    description: packageSource.metadata.summary,
    earliestCompatibleVersion: packageSource.earliestCompatibleVersion,
    containsPlugins: packageSource.containsPlugins(),
    dependencies: packageSource.getDependencyMetadata(),
    compilerInputsHash: compilerInputsHash
  };
  var uploadInfo = conn.call('createPackageVersion', uploadRec);

  // XXX If package version already exists, print a nice error message
  // telling them to try 'meteor publish-for-arch' if they want to
  // publish a new build.

  process.stdout.write('Uploading source...\n');
  packageClient.uploadTarball(uploadInfo.uploadUrl,
                              bundleResult.sourceTarball);

  process.stdout.write('Publishing package version...\n');
  conn.call('publishPackageVersion',
            uploadInfo.uploadToken, bundleResult.tarballHash);

  packageClient.createAndPublishBuiltPackage(conn, compileResult.unipackage,
                                             options.packageDir);

  catalog.refresh(true);

  return 0;
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
  catalog.refresh(true);

  if (! catalog.getPackage(options.name)) {
    process.stderr.write('No package named ' + options.name);
    return 1;
  }
  var pkgVersion = catalog.getVersion(options.name, options.versionString);
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
  var unipackage = compiler.compile(packageSource, {
    officialBuild: true
  }).unipackage;
  unipackage.saveToPath(path.join(packageDir, '.build.' + packageSource.name));

  var conn;
  try {
    conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  packageClient.createAndPublishBuiltPackage(conn, unipackage, packageDir);

  return 0;
});

main.registerCommand({
  name: 'publish-release',
  minArgs: 0,
  maxArgs: 0,
  options: {
    config: { type: String, required: true },
    create: { type: Boolean, required: false}
  }
}, function (options) {

  // Refresh the catalog, cacheing the remote package data on the server.
  catalog.refresh(true);

  var relConf;
  try {
    var data = fs.readFileSync(options.config, 'utf8');
    relConf = JSON.parse(data);
  } catch (e) {
    process.stderr.write("Could not parse release file: ");
    process.stderr.write(e.message + "\n");
    return 1;
  }

  // Check if the release track exists. If it doesn't, need the create flag.
  if (!options.create) {
    var trackRecord = catalog.getReleaseTrack(relConf.name);
    if (!trackRecord) {
      process.stderr.write('There is no release track named ' + relConf.name +
                           '. If you are creating a new track, use the --create flag. \n');
      return 1;
    }
    // XXX: check that we are an authorized maintainer as well.
  }

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

  if (options.create) {
    process.stdout.write("Creating a new release track... \n");
    var track = conn.call('createReleaseTrack',
                         { name: relConf.name } );
  }

  process.stdout.write("Creating a new release version... \n");

  // Send it over!
  var uploadInfo = conn.call('createReleaseVersion', {
    name: relConf.name,
    version: relConf.version,
    description: relConf.description,
    tool: relConf.tool,
    packages: relConf.packages
  });

  process.stdout.write("Done! \n");
  return 0;
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
