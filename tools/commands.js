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
var compiler = require('./compiler.js');
var catalog = require('./catalog.js');
var stats = require('./stats.js');
var unipackage = require('./unipackage.js');
var commandsPackages = require('./commands-packages.js');

// The architecture used by Galaxy servers; it's the architecture used
// by 'meteor deploy'.
var DEPLOY_ARCH = 'os.linux.x86_64';

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

  console.log(release.current.getDisplayName());
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

// Internal use only. For automated testing.
main.registerCommand({
  name: '--requires-release',
  requiresRelease: true
}, function (options) {
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

  // Calculate project versions. (XXX: Theoretically, we should not be doing it
  // here. We should do it lazily, if the command calls for it. However, we do
  // end up recalculating them for stats, for example, and, more importantly, we
  // have noticed some issues if we just leave this in the air. We think that
  // those issues are concurrency-related, or possibly some weird
  // order-of-execution of interaction that we are failing to understand. This
  // seems to fix it in a clear and understandable fashion.)
  var messages = buildmessage.capture(function () {
    project.getVersions();  // #StructuredProjectInitialization
  });
  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }

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
    package: { type: Boolean }
  }
}, function (options) {

  // Creating a package is much easier than creating an app, so if that's what
  // we are doing, do that first. (For example, we don't springboard to the
  // latest release to create a package if we are inside an app)
  if (options.package) {
    var packageName = options.args[0];

    // No package examples exist yet.
    if (options.list && options.example) {
      process.stderr.write("No package examples exist at this time.\n\n");
      throw new main.ShowUsage;
    }

    if (!packageName) {
      process.stderr.write("Please specify the name of the package. \n");
      throw new main.ShowUsage;
    }

    utils.validatePackageNameOrExit(
      packageName, {detailedColonExplanation: true});

    var packageDir = options.appDir
          ? path.resolve(options.appDir, 'packages', packageName)
          : path.resolve(packageName);
    var inYourApp = options.appDir ? " in your app" : "";

    if (fs.existsSync(packageDir)) {
      process.stderr.write(packageName + ": Already exists" + inYourApp + "\n");
      return 1;
    }

    var transform = function (x) {
      var xn = x.replace(/~name~/g, packageName);

      // If we are running from checkout, comment out the line sourcing packages
      // from a release, with the latest release filled in (in case they do want
      // to publish later). If we are NOT running from checkout, fill it out
      // with the current release.
      var relString;
      if (release.current.isCheckout()) {
        xn = xn.replace(/~cc~/g, "//");
        var rel = commandsPackages.doOrDie(function () {
          return catalog.official.getDefaultReleaseVersion();
        });
        var relString = rel.track + "@" + rel.version;
      } else {
        xn = xn.replace(/~cc~/g, "");
        relString = release.current.name;
      }

      // If we are not in checkout, write the current release here.
      return xn.replace(/~release~/g, relString);
    };
    try {
      files.cp_r(path.join(__dirname, 'skel-pack'), packageDir, {
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
   } catch (err) {
     process.stderr.write("Could not create package: " + err.message + "\n");
     return 1;
   }

    process.stdout.write(packageName + ": created" + inYourApp + "\n");
    return 0;
  }

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
  if (! release.current.isCheckout() && !release.forced) {
    var needToSpringboard = commandsPackages.doOrDie(function () {
      return release.current.name !== release.latestDownloaded();
    });
    if (needToSpringboard)
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
        // We try not to check the project ID into git, but it might still
        // accidentally exist and get added (if running from checkout, for
        // example). To be on the safe side, explicitly remove the project ID
        // from example apps.
        ignore: [/^local$/, /^\.id$/]
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
      ignore: [/^local$/, /^\.id$/]
    });
  }

  // We are actually working with a new meteor project at this point, so
  // reorient its path. We might do some things to it, but they should be
  // invisible to the user, so mute non-error output.
  project.setRootDir(path.resolve(appPath));
  project.setMuted(true);
  project.writeMeteorReleaseVersion(
    release.current.isCheckout() ? "none" : release.current.name);
  // Any upgrader that is in this version of Meteor doesn't need to be run on
  // this project.
  var upgraders = require('./upgraders.js');
  _.each(upgraders.allUpgraders(), function (upgrader) {
    project.appendFinishedUpgrader(upgrader);
  });

  var messages = buildmessage.capture(function () {
    project._ensureDepsUpToDate();
  });


  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }

  process.stdout.write(appPath + ": created");
  if (options.example && options.example !== appPath)
    process.stderr.write(" (from '" + options.example + "' template)");
  process.stdout.write(".\n\n");

  process.stdout.write(
    "To run your new app:\n" +
      "   cd " + appPath + "\n" +
      "   meteor\n");
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
    architecture: { type: String },
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

  // Error handling for options.architecture. We must pass in only one of three
  // architectures. See archinfo.js for more information on what the
  // architectures are, what they mean, et cetera.
  var VALID_ARCHITECTURES =
  ["os.osx.x86_64", "os.linux.x86_64", "os.linux.x86_32"];
  if (options.architecture &&
      _.indexOf(VALID_ARCHITECTURES, options.architecture) === -1) {
    process.stderr.write("Invalid architecture: " + options.architecture + "\n");
    process.stderr.write(
      "Please use one of the following: " + VALID_ARCHITECTURES + "\n");
    return 1;
  }
  var bundleArch =  options.architecture || archinfo.host();

  var buildDir = path.join(options.appDir, '.meteor', 'local', 'build_tar');
  var outputPath = path.resolve(options.args[0]); // get absolute path
  var bundlePath = options['directory'] ?
      outputPath : path.join(buildDir, 'bundle');

  var loader;
  var messages = buildmessage.capture(function () {
    loader = project.getPackageLoader();
  });
  if (messages.hasMessages()) {
    process.stderr.write("Errors prevented bundling your app:\n");
    process.stderr.write(messages.formatMessages());
    return 1;
  }

  var statsMessages = buildmessage.capture(function () {
    stats.recordPackages("sdk.bundle");
  });
  if (statsMessages.hasMessages()) {
    process.stdout.write("Error recording package list:\n" +
                         statsMessages.formatMessages());
    // ... but continue;
  }

  var bundler = require(path.join(__dirname, 'bundler.js'));
  var bundleResult = bundler.bundle({
    outputPath: bundlePath,
    buildOptions: {
      minify: ! options.debug,
      // XXX is this a good idea, or should linux be the default since
      //     that's where most people are deploying
      //     default?  i guess the problem with using DEPLOY_ARCH as default
      //     is then 'meteor bundle' with no args fails if you have any local
      //     packages with binary npm dependencies
      serverArch: bundleArch
    }
  });
  if (bundleResult.errors) {
    process.stderr.write("Errors prevented bundling:\n");
    process.stderr.write(bundleResult.errors.formatMessages());
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
    admin: { type: Boolean },
    // Override architecture to deploy whatever stuff we have locally, even if
    // it contains binary packages that should be incompatible. A hack to allow
    // people to deploy from checkout or do other weird shit. We are not
    // responsible for the consequences.
    'override-architecture-with-local' : { type: Boolean }
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

  // We are actually going to end up compiling an app at this point, so figure
  // out its versions. . (XXX: Theoretically, we should not be doing it here. We
  // should do it lazily, if the command calls for it. However, we do end up
  // recalculating them for stats, for example, and, more importantly, we have
  // noticed some issues if we just leave this in the air. We think that those
  // issues are concurrency-related, or possibly some weird order-of-execution
  // of interaction that we are failing to understand. This seems to fix it in a
  // clear and understandable fashion.)
  var messages = buildmessage.capture(function () {
    project.getVersions();  // #StructuredProjectInitialization
  });
  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
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

  // Override architecture iff applicable.
  var buildArch = DEPLOY_ARCH;
  if (options['override-architecture-with-local']) {
    process.stdout.write(
      "\n => WARNING: OVERRIDING DEPLOY ARCHITECTURE WITH LOCAL ARCHITECTURE\n");
    process.stdout.write(
      " => If your app contains binary code, it may break terribly and you will be sad.\n\n");
    buildArch = archinfo.host();
  }

  var buildOptions = {
    minify: ! options.debug,
    serverArch: buildArch
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
  if (options.args.length === 0) {
    // Test all local packages if no package is specified.
    testPackages = catalog.complete.getLocalPackageNames();
  } else {
    var messages = buildmessage.capture(function () {
      testPackages = _.map(options.args, function (p) {
        return buildmessage.enterJob({
          title: "trying to test package `" + p + "`"
        },  function () {

          // If it's a package name, just pass it through.
          if (p.indexOf('/') === -1) {
            if (p.indexOf('@') !== -1) {
              buildmessage.error(
                "You may not specify versions for local packages: " + p );
              // Recover by returning p anyway.
            }
            // Check to see if this is a real package, and if it is a real
            // package, if it has tests.
            if (!catalog.complete.isLocalPackage(p)) {
              buildmessage.error(
                "Not a known local package, cannot test: " + p );
              return p;
            }
            var versionNames = catalog.complete.getSortedVersions(p);
            if (versionNames.length !== 1)
              throw Error("local package should have one version?");
            var versionRec = catalog.complete.getVersion(p, versionNames[0]);
            if (versionRec && !versionRec.testName) {
              buildmessage.error(
                "There are no tests for package: " + p );
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
          catalog.complete.addLocalPackage(packageDir);

          if (buildmessage.jobHasMessages()) {
            // If we already had a problem, don't get another problem when we
            // run the hack below.
            return 'ignored';
          }

          // XXX: Hack.
          var PackageSource = require('./package-source.js');
          var packageSource = new PackageSource(catalog.complete);
          packageSource.initFromPackageDir(packageDir);

          return packageSource.name;
        });

      });
    });

    if (messages.hasMessages()) {
      process.stderr.write("\n" + messages.formatMessages());
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
  project.setMuted(true); // Mute output where applicable
  project.writeMeteorReleaseVersion(release.current.name || 'none');
  project.forceEditPackages(
    [options['driver-package'] || 'test-in-browser'],
    'add');

  // When we test packages, we need to know their versions and all of their
  // dependencies. We are going to add them to the project and have the project
  // compute them for us. This means that right now, we are testing all packages
  // as they work together.
  var tests = [];
  var messages = buildmessage.capture(function () {
    _.each(testPackages, function(name) {
      var versionNames = catalog.complete.getSortedVersions(name);
      if (versionNames.length !== 1)
        throw Error("local package should have one version?");
      var versionRecord = catalog.complete.getVersion(name, versionNames[0]);
      if (versionRecord && versionRecord.testName) {
        tests.push(versionRecord.testName);
      }
    });
  });
  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }
  project.forceEditPackages(tests, 'add');

  // We don't strictly need to do this before we bundle, but can't hurt.
  messages = buildmessage.capture({
    title: 'getting packages ready'
  },function () {
    project._ensureDepsUpToDate();
  });

  if (messages.hasMessages()) {
    process.stderr.write(messages.formatMessages());
    return 1;
  }

  var buildOptions = {
    minify: options.production
  };

  var ret;
  if (options.deploy) {
    buildOptions.serverArch = DEPLOY_ARCH;
    ret = deploy.bundleAndDeploy({
      appDir: testRunnerAppDir,
      site: options.deploy,
      settingsFile: options.settings,
      buildOptions: buildOptions,
      recordPackageUsage: false
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
      once: options.once,
      recordPackageUsage: false
    });
  }

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
      count = catalog.complete.rebuildLocalPackages(options.args);
    });
  }
  if (count)
    console.log("Built " + count + " packages.");
  if (messages.hasMessages()) {
    process.stderr.write("\n" + messages.formatMessages());
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
// organizations
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'admin create-organization',
  minArgs: 1,
  maxArgs: 1
}, function (options) {

  // XXX Not sure how to test this command now because
  // createOrganization is only accessible to verified @meteor.com
  // users.

  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    process.stderr.write("You must be logged in to create an organization.\n");
    return 1;
  }

  var conn = auth.loggedInAccountsConnection(token);
  conn.call("createOrganization", options.args[0]);
  process.stdout.write("Organization " + options.args[0] + " created.\n");
  return 0;
});

main.registerCommand({
  name: 'admin show-organization',
  minArgs: 1,
  maxArgs: 1
}, function (options) {

  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    process.stderr.write("You must be logged in to show an organization.\n");
    return 1;
  }

  var conn = auth.loggedInAccountsConnection(token);
  var result = conn.call("showOrganization", options.args[0]);
  process.stdout.write(result.join("\n") + "\n");
  return 0;
});

// List the organizations of which the current user is a member.
main.registerCommand({
  name: 'admin list-organizations',
  minArgs: 0,
  maxArgs: 0
}, function (options) {
  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    process.stderr.write("You must be logged in to list your organizations.\n");
    return 1;
  }

  var url = config.getAccountsApiUrl() + "/organizations";
  try {
    var result = httpHelpers.request({
      url: url,
      method: "GET",
      useSessionHeader: true,
      useAuthHeader: true
    });
    var body = JSON.parse(result.body);
  } catch (err) {
    console.log(err, result.body);
    process.stderr.write("Could not list organizations.\n");
    return 1;
  }

  if (! body || ! body.organizations) {
    process.stderr.write("Could not list organizations.\n");
    return 1;
  }

  if (body.organizations.length === 0) {
    process.stdout.write("You are not a member of any organizations.\n");
  } else {
    process.stdout.write(_.pluck(body.organizations, "name").join("\n") + "\n");
  }
  return 0;
});

main.registerCommand({
  name: 'admin delete-organization',
  minArgs: 1,
  maxArgs: 1
}, function (options) {

  // XXX Not sure how to test this command now because
  // createOrganization is only accessible to verified @meteor.com
  // users.

  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    process.stderr.write("You must be logged in to delete an organization.\n");
    return 1;
  }

  var conn = auth.loggedInAccountsConnection(token);
  conn.call("deleteOrganization", options.args[0]);
  process.stdout.write("Organization " + options.args[0] + " deleted.\n");
  return 0;
});

main.registerCommand({
  name: 'admin add-member',
  minArgs: 2,
  maxArgs: 2
}, function (options) {

  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    process.stderr.write("You must be logged in to edit organizations.\n");
    return 1;
  }

  var conn = auth.loggedInAccountsConnection(token);
  conn.call("addOrganizationMember", options.args[0], options.args[1]);
  process.stdout.write(options.args[1] + " added to organization " +
                       options.args[0] + ".\n");
  return 0;
});

main.registerCommand({
  name: 'admin remove-member',
  minArgs: 2,
  maxArgs: 2
}, function (options) {

  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    process.stderr.write("You must be logged in to edit organizations.\n");
    return 1;
  }

  var conn = auth.loggedInAccountsConnection(token);
  conn.call("removeOrganizationMember", options.args[0], options.args[1]);
  process.stdout.write(options.args[1] + " removed from organization " +
                       options.args[0] + ".\n");
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
    browserstack: { type: Boolean },
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

  var clients = {
    browserstack: options.browserstack
  };

  return selftest.runTests({
    onlyChanged: options.changed,
    offline: offline,
    includeSlowTests: options.slow,
    historyLines: options.history,
    clients: clients,
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
