var main = require('./main.js');

// XXX make sure that all of the following are actually used
var path = require('path');
var _ = require('underscore');
var fs = require("fs");
var cp = require('child_process');
var files = require('./files.js');
var deploy = require('./deploy.js');
var runner = require('./run.js');
var library = require('./library.js');
var buildmessage = require('./buildmessage.js');
var unipackage = require('./unipackage.js');
var project = require('./project.js');
var warehouse = require('./warehouse.js');
var logging = require('./logging.js');
var cleanup = require('./cleanup.js');
var httpHelpers = require('./http-helpers.js');
var auth = require('./auth.js');
var url = require('url');
var config = require('./config.js');
var Future = require('fibers/future');

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

// If the app is running (that is, by another 'meteor' process),
// return the port where mongo is listening. If the app is not
// running, return falsey.
//
// If called from a run that isn't in an app directory, print an error
// and kill the process!
var findMongoPort = function (appDir) {
  var fut = new Future;

  var mongo_runner = require(path.join(__dirname, 'mongo_runner.js'));
  mongo_runner.find_mongo_port(appDir, function (port) {
    fut.return(port);
  });

  return fut.wait();
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
  var context = options.context;

  if (! files.usesWarehouse()) {
    logging.die("Unreleased (running from a checkout)");
  }

  if (context.appReleaseVersion === "none") {
    logging.die(
"This project was created with a checkout of Meteor, rather than an\n" +
"official release, and doesn't have a release number associated with\n" +
"it. You can set its release with 'meteor update'.");
  }
  console.log("Release " + context.releaseVersion);
});

// Internal use only.
main.registerCommand({
  name: '--built-by',
  requiresRelease: false
}, function (options) {
  var packages = require('./packages.js');
  console.log(packages.BUILT_BY);
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
  var context = options.context;

  if (files.usesWarehouse()) {
    var updater = require('./updater.js');
    updater.performOneUpdateCheck(context, true /* silent */);
  } else {
    // dev bundle is downloaded by the wrapper script. We just need
    // to install NPM dependencies.
    _.each(context.library.list(), function (p) {
      p.preheat();
    });
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
  var context = options.context;

  if (files.usesWarehouse() &&
      context.appReleaseVersion !== 'none' &&
      context.appReleaseVersion !== context.releaseVersion) {
    console.log("=> Using Meteor %s as requested (overriding Meteor %s)",
                context.releaseVersion, context.appReleaseVersion);
    console.log();
  }

  auth.tryRevokeOldTokens({timeout: 1000});

  runner.run(options.appDir, context, {
    port: options.port,
    rawLogs: options['raw-logs'],
    minify: options.production,
    once: options.once,
    settingsFile: options.settings,
    program: options.program || undefined
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
  var appPath;
  if (options.args.length === 1)
    appPath = options.args[0];
  else if (options.example)
    appPath = options.example;
  else
    throw new main.ShowUsage;

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
    return 1;
  };

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
      transform_filename: function (f) {
        return transform(f);
      },
      transform_contents: function (contents, f) {
        if ((/(\.html|\.js|\.css)/).test(f))
          return new Buffer(transform(contents.toString()));
        else
          return contents;
      },
      ignore: [/^local$/]
    });
  }

  // Use the global release version, so that it isn't influenced by the
  // release version of the app dir you happen to be inside now.
  project.writeMeteorReleaseVersion(appPath,
                                    options.context.globalReleaseVersion);

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
    // Undocumented flag (used, eg, by upgrade-to-engine.js).
    'dont-fetch-latest': { type: Boolean }
  },
  // We have to be able to work without a release, since 'meteor
  // update' is how you fix apps that don't have a release.
  requiresRelease: false
}, function (options) {
  var context = options.context;

  // refuse to update if we're in a git checkout.
  if (! files.usesWarehouse()) {
    logging.die(
      "update: can only be run from official releases, not from checkouts");
  }

  var didGlobalUpdateWithoutSpringboarding = false;
  var triedToGloballyUpdateButFailed = false;

  // Unless the user specified a specific release (or we're doing a
  // mid-update springboard), go get the latest release.
  if (! options.release) {
    if (! options["dont-fetch-latest"]) {
      try {
        didGlobalUpdateWithoutSpringboarding =
          warehouse.fetchLatestRelease();
      } catch (e) {
        if (! (e instanceof files.OfflineError)) {
          console.error("Failed to update Meteor.");
          throw e;
        }
        // If the problem appears to be that we're offline, just log and
        // continue.
        console.log("Can't contact the update server. Are you online?");
        triedToGloballyUpdateButFailed = true;
      }
    }

    // sets context.releaseVersion to the latest release (if not
    // already there), rereads the manifest, and then if we're in a
    // different version of tools from that release, springboards
    main.hackContextForUpdateMaybeSpringboard(context);
  }

  // If we're not in an app, then we're done (other than maybe printing some
  // stuff).
  if (! options.appDir) {
    if (options["dont-fetch-latest"])
      return;
    if (options.release || didGlobalUpdateWithoutSpringboarding) {
      // If the user specified a specific release, or we just did a global
      // update (with springboarding, in which case --release is set, or
      // without springboarding, in which case didGlobalUpdate is set),
      // print this message.
      //
      // (Realize that if they specified --release, the release has
      // already been installed by virtue of the install/springboard
      // process that runs at startup even before command starts
      // running.)
      console.log("Installed. Run 'meteor update' inside of a particular project\n" +
                  "directory to update that project to Meteor %s.",
                  context.releaseVersion);
    } else {
      // The user just ran "meteor update" (without --release), and we did
      // not update.
      console.log("The latest version of Meteor, %s, is already installed on this\n" +
                  "computer. Run 'meteor update' inside of a particular project\n" +
                  "directory to update that project to Meteor %s.",
                  context.releaseVersion, context.releaseVersion);
    }
    return;
  }

  // Otherwise, we have to upgrade the app too, if the release changed.
  var appRelease = project.getMeteorReleaseVersion(options.appDir);
  if (appRelease !== null && appRelease === context.releaseVersion) {
    if (triedToGloballyUpdateButFailed) {
      console.log(
        "This project is already at Meteor %s, the latest release\n" +
          "installed on this computer.",
        context.releaseVersion);
    } else {
      console.log(
        "This project is already at Meteor %s, the latest release.",
        context.releaseVersion);
    }
    return;
  }

  // Write the release to .meteor/release.
  project.writeMeteorReleaseVersion(options.appDir,
                                    context.releaseVersion);

  // Find upgraders (in order) necessary to upgrade the app for the new
  // release (new metadata file formats, etc, or maybe even updating renamed
  // APIs). (If this is a pre-engine app with no .meteor/release file, run
  // all upgraders.)
  var oldManifest = appRelease === null ? {}
  : warehouse.ensureReleaseExistsAndReturnManifest(appRelease);
  // We can only run upgrades from pinned apps.
  if (oldManifest) {
    var upgraders = _.difference(context.releaseManifest.upgraders || [],
                                 oldManifest.upgraders || []);
    _.each(upgraders, function (upgrader) {
      require("./upgraders.js").runUpgrader(upgrader, options.appDir);
    });
  }

  // This is the right spot to do any other changes we need to the app in
  // order to update it for the new release .
  // XXX add app packages to .meteor/packages here for linker upgrade!
  console.log("%s: updated to Meteor %s.",
              path.basename(options.appDir), context.releaseVersion);

  // Print any notices relevant to this upgrade.
  // XXX This doesn't include package-specific notices for packages that
  // are included transitively (eg, packages used by app packages).
  var packages = project.get_packages(options.appDir);
  warehouse.printNotices(appRelease, context.releaseVersion, packages);
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
  var context = options.context;

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
  var context = options.context;

  var all = context.library.list();
  var using = {};
  _.each(project.get_packages(options.appDir), function (name) {
    using[name] = true;
  });

  _.each(options.args, function (name) {
    if (! (name in all)) {
      process.stderr.write(name + ": no such package\n");
    } else if (name in using) {
      process.stderr.write(name + ": already using\n");
    } else {
      project.add_package(options.appDir, name);
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
  var context = options.context;

  var using = {};
  _.each(project.get_packages(options.appDir), function (name) {
    using[name] = true;
  });

  _.each(options.args, function (name) {
    if (! (name in using)) {
      process.stderr.write(name + ": not in project\n");
    } else {
      project.remove_package(options.appDir, name);
      process.stderr.write(name + ": removed\n");
    }
  });
});

///////////////////////////////////////////////////////////////////////////////
// list
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'list',
  requiresApp: true,
  options: {
    using: { type: Boolean }
  }
}, function (options) {
  var context = options.context;

  if (options.using) {
    var using = project.get_packages(options.appDir);

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

  var list = context.library.list();
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

  var context = options.context;

  var buildDir = path.join(options.appDir, '.meteor', 'local', 'build_tar');
  var bundle_path = path.join(buildDir, 'bundle');
  var output_path = path.resolve(options.args[0]); // get absolute path

  var bundler = require(path.join(__dirname, 'bundler.js'));
  var bundleResult = bundler.bundle(options.appDir, bundle_path, {
    nodeModulesMode: options['for-deploy'] ? 'skip' : 'copy',
    minify: ! options.debug,
    releaseStamp: context.releaseVersion,
    library: context.library
  });
  if (bundleResult.errors) {
    process.stdout.write("Errors prevented bundling:\n");
    process.stdout.write(bundleResult.errors.formatMessages());
    return 1;
  }

  try {
    files.createTarball(path.join(buildDir, 'bundle'), output_path);
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

  if (options.args.length === 0) {
    // localhost mode
    var fut = new Future;
    var mongoPort = findMongoPort(options.appDir);
    if (! mongoPort) {
      process.stdout.write(
"mongo: Meteor isn't running.\n" +
"\n" +
"This command only works while Meteor is running your application\n" +
"locally. Start your application first.\n");
      return 1;
    }
    mongoUrl = "mongodb://127.0.0.1:" + mongod_port + "/meteor";

  } else {
    // remote mode
    var site = qualifySitename(options.args[0]);
    config.printUniverseBanner();

    if (hostedWithGalaxy(site)) {
      var deployGalaxy = require('./deploy-galaxy.js');
      mongoUrl = deployGalaxy.temporaryMongoUrl({
        app: site,
        context: options.context
      });
    } else {
      mongoUrl = deploy.temporaryMongoUrl(site);
    }
  }
  if (options.url) {
    console.log(mongoUrl);
  } else {
    process.stdin.pause();
    deploy.runMongoShell(mongoUrl);
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
  minArgs: 0,
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
  var context = options.context;
  var site = qualifySitename(options.args[0]);
  config.printUniverseBanner();
  var useGalaxy = hostedWithGalaxy(site);

  if (options.delete) {
    if (useGalaxy) {
      var deployGalaxy = require('./deploy-galaxy.js');
      deployGalaxy.deleteApp(site, context);
    } else {
      deploy.deleteApp(site);
    }
    return;
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

  // We don't need to be in an app if we're not going to run the bundler.
  var starball = options.star;
  // XXX I think this is only supported for deploying to Galaxy, so it
  // should print an error if you try to pass --starball while
  // deploying to Meteor.

  var settings = undefined;
  if (options.settings)
    settings = runner.getSettings(options.settings);

  if (! auth.isLoggedIn()) {
    process.stderr.write(
"To instantly deploy your app on a free testing server, just enter your\n" +
"email address!\n" +
"\n");

    if (! auth.registerOrLogIn(context))
      return 1;
  }

  if (useGalaxy) {
    var deployGalaxy = require('./deploy-galaxy.js');
    deployGalaxy.deploy({
      app: site,
      appDir: options.appDir,
      settings: settings,
      context: context,
      starball: starball,
      bundleOptions: {
        nodeModulesMode: 'skip',
        minify: ! options.debug,
        releaseStamp: context.releaseVersion,
        library: context.library
      },
      admin: options.admin
    });
  } else {
    deploy.bundleAndDeploy({
      appDir: options.appDir,
      site: site,
      settings: settings,
      bundleOptions: {
        nodeModulesMode: 'skip',
        minify: ! options.debug,
        releaseStamp: context.releaseVersion,
        library: context.library
      }
    });
  }
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
    deployGalaxy.logs({
      context: options.context,
      app: site,
      streaming: options.stream
    });
  } else {
    deploy.logs(site);
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
    add: { type: String, short: 'a' },
    remove: { type: String, short: 'r' },
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
    deploy.changeAuthorized(site, "add", options.add);
  else if (options.remove)
    deploy.changeAuthorized(site, "remove", options.remove);
  else
    deploy.listAuthorized(site);
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
  var site = qualifySitename(options.args[0]);

  if (! auth.isLoggedIn()) {
    process.stderr.write(
      "You must be logged in to claim sites. Try 'meteor login'.\n");
    return 1;
  }

  if (hostedWithGalaxy(site)) {
    process.stderr.write(
      "Sorry, you can't claim sites that are hosted on Galaxy.\n");
    return 1;
  }

  deploy.claim(site);
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
  var context = options.context;

  var testPackages;
  if (options.args.length === 0) {
    // XXX The call to list() here is unfortunate, because list()
    // can fail (eg, a package has a parse error) and if it does
    // we currently just exit! Which sucks because we don't get
    // reloading.
    testPackages = _.keys(context.library.list());
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
      context.library.override(packageName, packageDir);
      return packageName;
    });
  }

  // Make a temporary app dir (based on the test runner app). This will be
  // cleaned up on process exit. Using a temporary app dir means that we can
  // run multiple "test-packages" commands in parallel without them stomping
  // on each other.
  //
  // Note: testRunnerAppDir is DIFFERENT from
  // bundleOptions.library.appDir: we are bundling the test
  // runner app, but finding app packages from the current app (if any).
  var testRunnerAppDir = files.mkdtemp('meteor-test-run');
  files.cp_r(path.join(__dirname, 'test-runner-app'), testRunnerAppDir);
  project.add_package(testRunnerAppDir,
                      options['driver-package'] || 'test-in-browser');

  if (options.deploy) {
    deploy.bundleAndDeploy({
      appDir: testRunnerAppDir,
      site: options.deploy,
      settings: options.settings && runner.getSettings(options.settings),
      bundleOptions: {
        nodeModulesMode: 'skip',
        testPackages: testPackages,
        minify: options.production,
        releaseStamp: context.releaseVersion,
        library: context.library
      }
    });
  } else {
    runner.run(testRunnerAppDir, context, {
      port: options.port,
      minify: options.production,
      once: options.once,
      disableOplog: options['disable-oplog'],
      testPackages: testPackages,
      settingsFile: options.settings,
      banner: "Tests"
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
  var context = options.context;

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
    count = context.library.rebuildAll();
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
  raw: true
}, function (options) {
  // This is marked as raw, so we have to do all of our argument
  // parsing ourselves. This lets us make sure that the arguments to
  // the command being run don't get accidentally intrepreted.

  var context = options.context;
  var argv = process.argv.slice(3);
  if (! argv.length || argv[0] === "--help")
    throw new main.ShowUsage;

  if (! fs.existsSync(argv[0]) ||
      ! fs.statSync(argv[0]).isDirectory()) {
    process.stderr.write(argv[0] + ": not a directory\n");
    return 1;
  }

  // Build and load the package
  var world, packageName;
  var messages = buildmessage.capture(
    { title: "building the program" }, function () {
      // Make the directory visible as a package. Derive the last
      // package name from the last component of the directory, and
      // bail out if that creates a conflict.
      var packageDir = path.resolve(argv[0]);
      packageName = path.basename(packageDir) + "-tool";
      if (context.library.get(packageName, false)) {
        buildmessage.error("'" + packageName +
                           "' conflicts with the name " +
                           "of a package in the library");
      }
      context.library.override(packageName, packageDir);

      world = unipackage.load({
        library: context.library,
        packages: [ packageName ],
        release: context.releaseVersion
      });
    });
  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }

  if (! ('main' in world[packageName])) {
    process.stderr.write("Package does not define a main() function.\n");
    return 1;
  }

  var ret = world[packageName].main(argv.slice(1));
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
    galaxy: { type: String }
  }
}, function (options) {
  return auth.loginCommand(options);
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
