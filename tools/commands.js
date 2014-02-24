var main = require('./main.js');
var path = require('path');
var _ = require('underscore');
var fs = require("fs");
var files = require('./files.js');
var deploy = require('./deploy.js');
var library = require('./library.js');
var buildmessage = require('./buildmessage.js');
var unipackage = require('./unipackage.js');
var project = require('./project.js');
var warehouse = require('./warehouse.js');
var auth = require('./auth.js');
var config = require('./config.js');
var release = require('./release.js');
var Future = require('fibers/future');
var runLog = require('./run-log.js').runLog;

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

// Get all packages available. Returns a map from the package name to
// a Package object.
//
// If problems happen while generating the list, print appropriate
// messages to stderr and return null.
var getPackages = function () {
  var result = release.current.library.list();
  if (result.packages)
    return result.packages;

  process.stderr.write("=> Errors while scanning packages:\n\n");
  process.stderr.write(result.messages.formatMessages());
  return null;
};

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

// Internal use only. Makes sure that your Meteor install is totally
// good to go (is "airplane safe" and won't do any lengthy building on
// first run).
//
// In a checkout, this makes sure that the checkout is "complete" (dev
// bundle downloaded and all NPM modules installed). Otherwise, this
// runs one full update cycle, to make sure that you have the latest
// manifest and all of the packages in it.
main.registerCommand({
  name: '--get-ready',
  requiresRelease: false
}, function (options) {
  if (files.usesWarehouse()) {
    var updater = require('./updater.js');
    updater.tryToDownloadUpdate();
  } else {
    // dev bundle is downloaded by the wrapper script. We just need
    // to install NPM dependencies.
    if (! release.current)
      // This is a weird case. Fail silently.
      return 0;

    var packages = getPackages();
    if (! packages)
      return 1; // build failed

    // XXX we rely on the fact that library.list() forces all of the
    // packages to be built. #ListingPackagesImpliesBuildingThem
  }
});

///////////////////////////////////////////////////////////////////////////////
// run
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'run',
  requiresApp: true,
  options: {
    port: { type: Number, short: "p", default: 3000 },
    'app-port': { type: Number },
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
    port: options.port,
    appPort: options['app-port'],
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
  var all = getPackages();
  if (! all)
    return 1;

  var using = {};
  _.each(project.getPackages(options.appDir), function (name) {
    using[name] = true;
  });

  _.each(options.args, function (name) {
    if (! _.has(all, name)) {
      process.stderr.write(name + ": no such package\n");
    } else if (_.has(using, name)) {
      process.stderr.write(name + ": already using\n");
    } else {
      project.addPackage(options.appDir, name);
      var note = all[name].metadata.summary || '';
      process.stderr.write(name + ": " + note + "\n");
    }
  });
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
  var using = {};
  _.each(project.getPackages(options.appDir), function (name) {
    using[name] = true;
  });

  _.each(options.args, function (name) {
    if (! _.has(using, name)) {
      process.stderr.write(name + ": not in project\n");
    } else {
      project.removePackage(options.appDir, name);
      process.stderr.write(name + ": removed\n");
    }
  });
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
    using: { type: Boolean }
  }
}, function (options) {
  if (options.using) {
    var using = project.getPackages(options.appDir);

    if (using.length) {
      _.each(using, function (name) {
        process.stdout.write(name + "\n");
      });
    } else {
      process.stderr.write(
"This project doesn't use any packages yet. To add some packages:\n" +
"  meteor add <package> <package> ...\n" +
"\n" +
"To see available packages:\n" +
"  meteor list\n");
    }
    return;
  }

  var list = getPackages();
  if (! list)
    return 1;
  var names = _.keys(list);
  names.sort();
  var pkgs = [];
  _.each(names, function (name) {
    pkgs.push(list[name]);
  });
  process.stdout.write("\n" + library.formatList(pkgs) + "\n");
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
  var bundleResult = bundler.bundle({
    appDir: options.appDir,
    outputPath: bundlePath,
    nodeModulesMode: options['for-deploy'] ? 'skip' : 'copy',
    buildOptions: {
      minify: ! options.debug
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
  if (options.args.length === 0) {
    var packageList = getPackages();
    if (! packageList) {
      // Couldn't load the package list, probably because some package
      // has a parse error. Bail out -- this kind of sucks; we would
      // like to find a way to get reloading.
      return 1;
    }
    testPackages = _.keys(packageList);
  } else {
    testPackages = _.map(options.args, function (p) {
      // If it's a package name, just pass it through.
      if (p.indexOf('/') === -1)
        return p;

      // Otherwise it's a directory; load it into a Package now. Use
      // path.resolve to strip trailing slashes, so that packageName doesn't
      // have a trailing slash.
      var packageDir = path.resolve(p);
      var packageName = path.basename(packageDir);
      release.current.library.override(packageName, packageDir);
      return packageName;
    });
  }

  // Make a temporary app dir (based on the test runner app). This will be
  // cleaned up on process exit. Using a temporary app dir means that we can
  // run multiple "test-packages" commands in parallel without them stomping
  // on each other.
  //
  // Note: testRunnerAppDir deliberately DOES NOT MATCH the app
  // package search path baked into release.current.library: we are
  // bundling the test runner app, but finding app packages from the
  // current app (if any).
  var testRunnerAppDir = files.mkdtemp('meteor-test-run');
  files.cp_r(path.join(__dirname, 'test-runner-app'), testRunnerAppDir);
  project.writeMeteorReleaseVersion(testRunnerAppDir,
                                    release.current.name || 'none');
  project.addPackage(testRunnerAppDir,
                     options['driver-package'] || 'test-in-browser');

  var buildOptions = {
    testPackages: testPackages,
    minify: options.production
  };

  if (options.deploy) {
    return deploy.bundleAndDeploy({
      appDir: testRunnerAppDir,
      site: options.deploy,
      settingsFile: options.settings,
      buildOptions: buildOptions
    });
  } else {
    var runAll = require('./run-all.js');
    return runAll.run(testRunnerAppDir, {
      // if we're testing packages from an app, we still want to make
      // sure the user doesn't 'meteor update' in the app, requiring
      // a switch to a different release
      appDirForVersionCheck: options.appDir,
      port: options.port,
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
});

///////////////////////////////////////////////////////////////////////////////
// rebuild-all
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'rebuild-all',
  hidden: true
}, function (options) {
  if (options.appDir) {
    // The library doesn't know about other programs in your app. Let's blow
    // away their .build directories if they have them, and not rebuild
    // them. Sort of hacky, but eh.
    var programsDir = path.join(options.appDir, 'programs');
    try {
      var programs = fs.readdirSync(programsDir);
    } catch (e) {
      // OK if the programs directory doesn't exist; that'll just leave
      // 'programs' empty.
      if (e.code !== "ENOENT")
        throw e;
    }
    _.each(programs, function (program) {
      files.rm_recursive(path.join(programsDir, program, '.build'));
    });
  }

  var count = null;
  var messages = buildmessage.capture(function () {
    count = release.current.library.rebuildAll();
  });
  if (count)
    console.log("Built " + count + " packages.");
  if (messages.hasMessages()) {
    process.stdout.write("\n" + messages.formatMessages());
    return 1;
  }
});


///////////////////////////////////////////////////////////////////////////////
// run-command
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'run-command',
  hidden: true,
  minArgs: 1,
  maxArgs: Infinity
}, function (options) {
  var library = release.current.library;

  if (! fs.existsSync(options.args[0]) ||
      ! fs.statSync(options.args[0]).isDirectory()) {
    process.stderr.write(options.args[0] + ": not a directory\n");
    return 1;
  }

  // Build and load the package
  var world, packageName;
  var messages = buildmessage.capture(
    { title: "building the program" }, function () {
      // Make the directory visible as a package. Derive the last
      // package name from the last component of the directory, and
      // bail out if that creates a conflict.
      var packageDir = path.resolve(options.args[0]);
      packageName = path.basename(packageDir) + "-tool";
      if (library.get(packageName, false)) {
        buildmessage.error("'" + packageName +
                           "' conflicts with the name " +
                           "of a package in the library");
      }
      library.override(packageName, packageDir);

      world = unipackage.load({
        library: library,
        packages: [ packageName ],
        release: release.current.name
      });
    });
  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }

  if (typeof world[packageName].main !== "function") {
    process.stderr.write("Package does not define a main() function.\n");
    return 1;
  }

  var ret = world[packageName].main(options.args.slice(1));
  // let exceptions propagate and get printed by node
  if (ret === undefined)
    ret = 0;
  if (typeof ret !== "number")
    ret = 1;
  ret = +ret; // cast to integer
  return ret;
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
