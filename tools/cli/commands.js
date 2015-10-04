var main = require('./main.js');
var _ = require('underscore');
var files = require('../fs/files.js');
var deploy = require('../meteor-services/deploy.js');
var buildmessage = require('../utils/buildmessage.js');
var auth = require('../meteor-services/auth.js');
var authClient = require('../meteor-services/auth-client.js');
var config = require('../meteor-services/config.js');
var Future = require('fibers/future');
var runLog = require('../runners/run-log.js');
var utils = require('../utils/utils.js');
var httpHelpers = require('../utils/http-helpers.js');
var archinfo = require('../utils/archinfo.js');
var catalog = require('../packaging/catalog/catalog.js');
var stats = require('../meteor-services/stats.js');
var Console = require('../console/console.js').Console;
var projectContextModule = require('../project-context.js');
var release = require('../packaging/release.js');

import * as cordova from '../cordova';
import { CordovaProject } from '../cordova/project.js';
import { CordovaRunner } from '../cordova/runner.js';
import { iOSRunTarget, AndroidRunTarget } from '../cordova/run-targets.js';

// The architecture used by MDG's hosted servers; it's the architecture used by
// 'meteor deploy'.
var DEPLOY_ARCH = 'os.linux.x86_64';

// The default port that the development server listens on.
var DEFAULT_PORT = '3000';

// Valid architectures that Meteor officially supports.
var VALID_ARCHITECTURES = {
  "os.osx.x86_64": true,
  "os.linux.x86_64": true,
  "os.linux.x86_32": true,
  "os.windows.x86_32": true
};


// __dirname - the location of the current executing file
var __dirnameConverted = files.convertToStandardPath(__dirname);

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

// Display a message showing valid Meteor architectures.
var showInvalidArchMsg = function (arch) {
  Console.info("Invalid architecture: " + arch);
  Console.info("The following are valid Meteor architectures:");
  _.each(_.keys(VALID_ARCHITECTURES), function (va) {
    Console.info(
      Console.command(va),
      Console.options({ indent: 2 }));
  });
};

// Utility functions to parse options in run/build/test-packages commands

export function parseServerOptionsForRunCommand(options, runTargets) {
  const parsedServerUrl = parsePortOption(options.port);

  // XXX COMPAT WITH 0.9.2.2 -- the 'mobile-port' option is deprecated
  const mobileServerOption = options['mobile-server'] || options['mobile-port'];
  let parsedMobileServerUrl;
  if (mobileServerOption) {
    parsedMobileServerUrl = parseMobileServerOption(mobileServerOption);
  } else {
    const isRunOnDeviceRequested = _.any(runTargets,
      runTarget => runTarget.isDevice);
    parsedMobileServerUrl = detectMobileServerUrl(parsedServerUrl,
      isRunOnDeviceRequested);
  }

  return { parsedServerUrl, parsedMobileServerUrl };
}

function parsePortOption(portOption) {
  let parsedServerUrl = utils.parseUrl(portOption);

  if (!parsedServerUrl.port) {
    Console.error("--port must include a port.");
    throw new main.ExitWithCode(1);
  }

  return parsedServerUrl;
}

function parseMobileServerOption(mobileServerOption,
  optionName = 'mobile-server') {
  let parsedMobileServerUrl = utils.parseUrl(
    mobileServerOption,
    { protocol: 'http://' });

  if (!parsedMobileServerUrl.host) {
    Console.error(`--${optionName} must include a hostname.`);
    throw new main.ExitWithCode(1);
  }

  return parsedMobileServerUrl;
}

function detectMobileServerUrl(parsedServerUrl, isRunOnDeviceRequested) {
  // If we are running on a device, use the auto-detected IP
  if (isRunOnDeviceRequested) {
    let myIp;
    try {
      myIp = utils.ipAddress();
    } catch (error) {
      Console.error(
`Error detecting IP address for mobile app to connect to:
${error.message}
Please specify the address that the mobile app should connect
to with --mobile-server.`);
      throw new main.ExitWithCode(1);
    }
    return {
      protocol: 'http://',
      host: myIp,
      port: parsedServerUrl.port
    };
  } else {
    // We are running a simulator, use localhost
    return {
      protocol: 'http://',
      host: 'localhost',
      port: parsedServerUrl.port
    };
  }
}

export function parseRunTargets(targets) {
  return targets.map((target) => {
    const targetParts = target.split('-');
    const platform = targetParts[0];
    const isDevice = targetParts[1] === 'device';

    if (platform == 'ios') {
      return new iOSRunTarget(isDevice);
    } else if (platform == 'android') {
      return new AndroidRunTarget(isDevice);
    } else {
      Console.error(`Unknown run target: ${target}`);
      throw new main.ExitWithCode(1);
    }
  });
};

///////////////////////////////////////////////////////////////////////////////
// options that act like commands
///////////////////////////////////////////////////////////////////////////////

// Prints the Meteor architecture name of this host
main.registerCommand({
  name: '--arch',
  requiresRelease: false,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.rawInfo(archinfo.host() + "\n");
});

// Prints the current release in use. Note that if there is not
// actually a specific release, we print to stderr and exit non-zero,
// while if there is a release we print to stdout and exit zero
// (making this useful to scripts).
// XXX: What does this mean in our new release-free world?
main.registerCommand({
  name: '--version',
  requiresRelease: false,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  if (release.current === null) {
    if (! options.appDir)
      throw new Error("missing release, but not in an app?");
    Console.error(
      "This project was created with a checkout of Meteor, rather than an " +
      "official release, and doesn't have a release number associated with " +
      "it. You can set its release with " +
      Console.command("'meteor update'") + ".");
    return 1;
  }

  if (release.current.isCheckout()) {
    var gitLog = utils.runGitInCheckout(
      'log',
      '--format=%h%d', '-n 1').trim();
    Console.error("Unreleased, running from a checkout at " + gitLog);
    return 1;
  }

  Console.info(release.current.getDisplayName());
});

// Internal use only. For automated testing.
main.registerCommand({
  name: '--long-version',
  requiresRelease: false,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  if (files.inCheckout()) {
    Console.error("checkout");
    return 1;
  } else if (release.current === null) {
    // .meteor/release says "none" but not in a checkout.
    Console.error("none");
    return 1;
  } else {
    Console.rawInfo(release.current.name + "\n");
    Console.rawInfo(files.getToolsVersion() + "\n");
    return 0;
  }
});

// Internal use only. For automated testing.
main.registerCommand({
  name: '--requires-release',
  requiresRelease: true,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  return 0;
});

///////////////////////////////////////////////////////////////////////////////
// run
///////////////////////////////////////////////////////////////////////////////

var runCommandOptions = {
  requiresApp: true,
  maxArgs: Infinity,
  options: {
    port: { type: String, short: "p", default: DEFAULT_PORT },
    'mobile-server': { type: String },
    // XXX COMPAT WITH 0.9.2.2
    'mobile-port': { type: String },
    'app-port': { type: String },
    'debug-port': { type: String },
    production: { type: Boolean },
    'raw-logs': { type: Boolean },
    settings: { type: String },
    test: {type: Boolean, default: false},
    verbose: { type: Boolean, short: "v" },
    // With --once, meteor does not re-run the project if it crashes
    // and does not monitor for file changes. Intentionally
    // undocumented: intended for automated testing (eg, cli-test.sh),
    // not end-user use. #Once
    once: { type: Boolean },
    // Don't run linter on rebuilds
    'no-lint': { type: Boolean },
    // Allow the version solver to make breaking changes to the versions
    // of top-level dependencies.
    'allow-incompatible-update': { type: Boolean }
  },
  catalogRefresh: new catalog.Refresh.Never()
};

main.registerCommand(_.extend(
  { name: 'run' },
  runCommandOptions
), doRunCommand);

function doRunCommand(options) {
  Console.setVerbose(!!options.verbose);

  // Additional args are interpreted as run targets
  const runTargets = parseRunTargets(options.args);

  const { parsedServerUrl, parsedMobileServerUrl } =
    parseServerOptionsForRunCommand(options, runTargets);

  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    allowIncompatibleUpdate: options['allow-incompatible-update'],
    lintAppAndLocalPackages: !options['no-lint']
  });

  main.captureAndExit("=> Errors while initializing project:", function () {
    // We're just reading metadata here --- we'll wait to do the full build
    // preparation until after we've started listening on the proxy, etc.
    projectContext.readProjectMetadata();
  });

  if (release.explicit) {
    if (release.current.name !== projectContext.releaseFile.fullReleaseName) {
      console.log("=> Using %s as requested (overriding %s)",
                  release.current.getDisplayName(),
                  projectContext.releaseFile.displayReleaseName);
      console.log();
    }
  }

  let appHost, appPort;
  if (options['app-port']) {
    var appPortMatch = options['app-port'].match(/^(?:(.+):)?([0-9]+)?$/);
    if (!appPortMatch) {
      Console.error(
        "run: --app-port must be a number or be of the form 'host:port' ",
        "where port is a number. Try",
        Console.command("'meteor help run'") + " for help.");
      return 1;
    }
    appHost = appPortMatch[1] || null;
    // It's legit to specify `--app-port host:` and still let the port be
    // randomized.
    appPort = appPortMatch[2] ? parseInt(appPortMatch[2]) : null;
  }

  if (options['raw-logs'])
    runLog.setRawLogs(true);

  // Velocity testing. Sets up a DDP connection to the app process and
  // runs phantomjs.
  //
  // NOTE: this calls process.exit() when testing is done.
  if (options['test']){
    options.once = true;
    const serverUrlForVelocity =
    `http://${(parsedServerUrl.host || "localhost")}:${parsedServerUrl.port}`;
    const velocity = require('../runners/run-velocity.js');
    velocity.runVelocity(serverUrlForVelocity);
  }

  let cordovaRunner;

  if (!_.isEmpty(runTargets)) {
    main.captureAndExit('', 'preparing Cordova project', () => {
      const cordovaProject = new CordovaProject(projectContext, {
        settingsFile: options.settings,
        mobileServerUrl: utils.formatUrl(parsedMobileServerUrl) });

      cordovaRunner = new CordovaRunner(cordovaProject, runTargets);
      cordovaRunner.checkPlatformsForRunTargets();
    });
  }

  var runAll = require('../runners/run-all.js');
  return runAll.run({
    projectContext: projectContext,
    proxyPort: parsedServerUrl.port,
    proxyHost: parsedServerUrl.host,
    appPort: appPort,
    appHost: appHost,
    debugPort: options['debug-port'],
    settingsFile: options.settings,
    buildOptions: {
      minifyMode: options.production ? 'production' : 'development',
      buildMode: options.production ? 'production' : 'development'
    },
    rootUrl: process.env.ROOT_URL,
    mongoUrl: process.env.MONGO_URL,
    oplogUrl: process.env.MONGO_OPLOG_URL,
    mobileServerUrl: utils.formatUrl(parsedMobileServerUrl),
    once: options.once,
    cordovaRunner: cordovaRunner
  });
}

///////////////////////////////////////////////////////////////////////////////
// debug
///////////////////////////////////////////////////////////////////////////////

main.registerCommand(_.extend(
  { name: 'debug' },
  runCommandOptions
), function (options) {
  options['debug-port'] = options['debug-port'] || '5858';
  return doRunCommand(options);
});

///////////////////////////////////////////////////////////////////////////////
// shell
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'shell',
  requiresRelease: false,
  requiresApp: true,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  if (!options.appDir) {
    Console.error(
      "The " + Console.command("'meteor shell'") + " command must be run",
      "in a Meteor app directory."
    );
  } else {
    var projectContext = new projectContextModule.ProjectContext({
      projectDir: options.appDir
    });

    // Convert to OS path here because shell/server.js doesn't know how to
    // convert paths, since it exists in the app and in the tool.
    require('../shell-client.js').connect(
      files.convertToOSPath(projectContext.getMeteorShellDirectory())
    );

    throw new main.WaitForExit;
  }
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
  },
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {

  // Creating a package is much easier than creating an app, so if that's what
  // we are doing, do that first. (For example, we don't springboard to the
  // latest release to create a package if we are inside an app)
  if (options.package) {
    var packageName = options.args[0];

    // No package examples exist yet.
    if (options.list && options.example) {
      Console.error("No package examples exist at this time.");
      Console.error();
      throw new main.ShowUsage;
    }

    if (!packageName) {
      Console.error("Please specify the name of the package.");
      throw new main.ShowUsage;
    }

    utils.validatePackageNameOrExit(
      packageName, {detailedColonExplanation: true});

    // When we create a package, avoid introducing a colon into the file system
    // by naming the directory after the package name without the prefix.
    var fsName = packageName;
    if (packageName.indexOf(":") !== -1) {
      var split = packageName.split(":");

      if (split.length > 2) {
        // It may seem like this check should be inside package version parser's
        // validatePackageName, but we decided to name test packages like this:
        // local-test:prefix:name, so we have to support building packages
        // with at least two colons. Therefore we will at least try to
        // discourage people from putting a ton of colons in their package names
        // here.
        Console.error(packageName +
          ": Package names may not have more than one colon.");
        return 1;
      }

      fsName = split[1];
    }

    var packageDir;
    if (options.appDir) {
      packageDir = files.pathResolve(options.appDir, 'packages', fsName);
    } else {
      packageDir = files.pathResolve(fsName);
    }

    var inYourApp = options.appDir ? " in your app" : "";

    if (files.exists(packageDir)) {
      Console.error(packageName + ": Already exists" + inYourApp);
      return 1;
    }

    var transform = function (x) {
      var xn =
        x.replace(/~name~/g, packageName).replace(/~fs-name~/g, fsName);

      // If we are running from checkout, comment out the line sourcing packages
      // from a release, with the latest release filled in (in case they do want
      // to publish later). If we are NOT running from checkout, fill it out
      // with the current release.
      var relString;
      if (release.current.isCheckout()) {
        xn = xn.replace(/~cc~/g, "//");
        var rel = catalog.official.getDefaultReleaseVersion();
        // the no-release case should never happen except in tests.
        relString = rel ? rel.version : "no-release";
      } else {
        xn = xn.replace(/~cc~/g, "");
        relString = release.current.getDisplayName({noPrefix: true});
      }

      // If we are not in checkout, write the current release here.
      return xn.replace(/~release~/g, relString);
    };

    try {
      files.cp_r(files.pathJoin(__dirnameConverted, '..', 'static-assets', 'skel-pack'), packageDir, {
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
      Console.error("Could not create package: " + err.message);
      return 1;
    }

    var displayPackageDir =
      files.convertToOSPath(files.pathRelative(files.cwd(), packageDir));

    // Since the directory can't have colons, the directory name will often not
    // match the name of the package exactly, therefore we should tell people
    // where it was created.
    Console.info(
      packageName + ": created in",
      Console.path(displayPackageDir)
    );

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
    if (release.current.name !== release.latestKnown()) {
      throw new main.SpringboardToLatestRelease;
    }
  }

  var exampleDir = files.pathJoin(__dirnameConverted, '..', '..', 'examples');
  var examples = _.reject(files.readdir(exampleDir), function (e) {
    return (e === 'unfinished' || e === 'other'  || e[0] === '.');
  });

  if (options.list) {
    Console.info("Available examples:");
    _.each(examples, function (e) {
      Console.info(
        Console.command(e),
        Console.options({ indent: 2 }));
    });
    Console.info();
    Console.info(
      "Create a project from an example with " +
      Console.command("'meteor create --example <name>'") + ".");
    return 0;
  };

  var appPathAsEntered;
  if (options.args.length === 1)
    appPathAsEntered = options.args[0];
  else if (options.example)
    appPathAsEntered = options.example;
  else
    throw new main.ShowUsage;
  var appPath = files.pathResolve(appPathAsEntered);

  if (files.findAppDir(appPath)) {
    Console.error(
      "You can't create a Meteor project inside another Meteor project.");
    return 1;
  }

  var appName;
  if (appPathAsEntered === "." || appPathAsEntered === "./") {
    // If trying to create in current directory
    appName = files.pathBasename(files.cwd());
  } else {
    appName = files.pathBasename(appPath);
  }


  var transform = function (x) {
    return x.replace(/~name~/g, appName);
  };

  // These file extensions are usually metadata, not app code
  var nonCodeFileExts = ['.txt', '.md', '.json', '.sh'];

  var destinationHasCodeFiles = false;

  // If the directory doesn't exist, it clearly doesn't have any source code
  // inside itself
  if (files.exists(appPath)) {
    destinationHasCodeFiles = _.any(files.readdir(appPath),
        function thisPathCountsAsAFile(filePath) {
      // We don't mind if there are hidden files or directories (this includes
      // .git) and we don't need to check for .meteor here because the command
      // will fail earlier
      var isHidden = /^\./.test(filePath);
      if (isHidden) {
        // Not code
        return false;
      }

      // We do mind if there are non-hidden directories, because we don't want
      // to recursively check everything to do some crazy heuristic to see if
      // we should try to creat an app.
      var stats = files.stat(filePath);
      if (stats.isDirectory()) {
        // Could contain code
        return true;
      }

      // Check against our file extension white list
      var ext = files.pathExtname(filePath);
      if (ext == '' || _.contains(nonCodeFileExts, ext)) {
        return false;
      }

      // Everything not matched above is considered to be possible source code
      return true;
    });
  }

  if (options.example) {
    if (destinationHasCodeFiles) {
      Console.error(`When creating an example app, the destination directory \
can only contain dot-files or files with the following extensions: \
${nonCodeFileExts.join(', ')}
`);
      return 1;
    }

    if (examples.indexOf(options.example) === -1) {
      Console.error(options.example + ": no such example.");
      Console.error();
      Console.error(
        "List available applications with",
        Console.command("'meteor create --list'") + ".");
      return 1;
    } else {
      files.cp_r(files.pathJoin(exampleDir, options.example), appPath, {
        // We try not to check the project ID into git, but it might still
        // accidentally exist and get added (if running from checkout, for
        // example). To be on the safe side, explicitly remove the project ID
        // from example apps.
        ignore: [/^local$/, /^\.id$/]
      });
    }
  } else {
    var toIgnore = [/^local$/, /^\.id$/]
    if (destinationHasCodeFiles) {
      // If there is already source code in the directory, don't copy our
      // skeleton app code over it. Just create the .meteor folder and metadata
      toIgnore.push(/(\.html|\.js|\.css)/)
    }

    files.cp_r(files.pathJoin(__dirnameConverted, '..', 'static-assets', 'skel'), appPath, {
      transformFilename: function (f) {
        return transform(f);
      },
      transformContents: function (contents, f) {
        if ((/(\.html|\.js|\.css)/).test(f))
          return new Buffer(transform(contents.toString()));
        else
          return contents;
      },
      ignore: toIgnore
    });
  }

  // We are actually working with a new meteor project at this point, so
  // set up its context.
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: appPath,
    // Write .meteor/versions even if --release is specified.
    alwaysWritePackageMap: true,
    // examples come with a .meteor/versions file, but we shouldn't take it
    // too seriously
    allowIncompatibleUpdate: true
  });

  main.captureAndExit("=> Errors while creating your project", function () {
    projectContext.readProjectMetadata();
    if (buildmessage.jobHasMessages())
      return;

    projectContext.releaseFile.write(
      release.current.isCheckout() ? "none" : release.current.name);
    if (buildmessage.jobHasMessages())
      return;

    // Any upgrader that is in this version of Meteor doesn't need to be run on
    // this project.
    var upgraders = require('../upgraders.js');
    projectContext.finishedUpgraders.appendUpgraders(upgraders.allUpgraders());

    projectContext.prepareProjectForBuild();
  });
  // No need to display the PackageMapDelta here, since it would include all of
  // the packages (or maybe an unpredictable subset based on what happens to be
  // in the template's versions file).

  var appNameToDisplay = appPathAsEntered === "." ?
    "current directory" : `'${appPathAsEntered}'`;

  var message = `Created a new Meteor app in ${appNameToDisplay}`;

  if (options.example && options.example !== appPathAsEntered) {
    message += ` (from '${options.example}' template)`;
  }

  message += ".";

  Console.info(message + "\n");

  // Print a nice message telling people we created their new app, and what to
  // do next.
  Console.info("To run your new app:");

  if (appPathAsEntered !== ".") {
    // Wrap the app path in quotes if it contains spaces
    const appPathWithQuotesIfSpaces = appPathAsEntered.indexOf(' ') === -1 ?
      appPathAsEntered :
      `'${appPathAsEntered}'`;

    // Don't tell people to 'cd .'
    Console.info(
      Console.command("cd " + appPathWithQuotesIfSpaces),
        Console.options({ indent: 2 }));
  }

  Console.info(
    Console.command("meteor"), Console.options({ indent: 2 }));

  Console.info("");
  Console.info("If you are new to Meteor, try some of the learning resources here:");
  Console.info(
    Console.url("https://www.meteor.com/learn"),
      Console.options({ indent: 2 }));

  Console.info("");
});

///////////////////////////////////////////////////////////////////////////////
// build
///////////////////////////////////////////////////////////////////////////////

var buildCommands = {
  minArgs: 1,
  maxArgs: 1,
  requiresApp: true,
  options: {
    debug: { type: Boolean },
    directory: { type: Boolean },
    architecture: { type: String },
    'mobile-settings': { type: String },
    server: { type: String },
    // XXX COMPAT WITH 0.9.2.2
    "mobile-port": { type: String },
    verbose: { type: Boolean, short: "v" },
    'allow-incompatible-update': { type: Boolean }
  },
  catalogRefresh: new catalog.Refresh.Never()
};

main.registerCommand(_.extend({ name: 'build' }, buildCommands),
  function (options) {
    return buildCommand(options);
});

// Deprecated -- identical functionality to 'build' with one exception: it
// doesn't output a directory with all builds but rather only one tarball with
// server/client programs.
// XXX COMPAT WITH 0.9.1.1
main.registerCommand(_.extend({ name: 'bundle', hidden: true
                              }, buildCommands),
    function (options) {

      Console.error(
      "This command has been deprecated in favor of " +
      Console.command("'meteor build'") + ", which allows you to " +
      "build for multiple platforms and outputs a directory instead of " +
      "a single tarball. See " + Console.command("'meteor help build'") + " " +
      "for more information.");
      Console.error();
      return buildCommand(_.extend(options, { _serverOnly: true }));
});

var buildCommand = function (options) {
  Console.setVerbose(!!options.verbose);
  // XXX output, to stderr, the name of the file written to (for human
  // comfort, especially since we might change the name)

  // XXX name the root directory in the bundle based on the basename
  // of the file, not a constant 'bundle' (a bit obnoxious for
  // machines, but worth it for humans)

  // Error handling for options.architecture. We must pass in only one of three
  // architectures. See archinfo.js for more information on what the
  // architectures are, what they mean, et cetera.
  if (options.architecture &&
      !_.has(VALID_ARCHITECTURES, options.architecture)) {
    showInvalidArchMsg(options.architecture);
    return 1;
  }
  var bundleArch = options.architecture || archinfo.host();

  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    serverArchitectures: _.uniq([bundleArch, archinfo.host()]),
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });

  main.captureAndExit("=> Errors while initializing project:", function () {
    projectContext.prepareProjectForBuild();
  });
  projectContext.packageMapDelta.displayOnConsole();

  // options['mobile-settings'] is used to set the initial value of
  // `Meteor.settings` on mobile apps. Pass it on to options.settings,
  // which is used in this command.
  if (options['mobile-settings']) {
    options.settings = options['mobile-settings'];
  }

  const appName = files.pathBasename(options.appDir);

  let cordovaPlatforms;
  let parsedMobileServerUrl;
  if (!options._serverOnly) {
    cordovaPlatforms = projectContext.platformList.getCordovaPlatforms();

    if (process.platform === 'win32' && !_.isEmpty(cordovaPlatforms)) {
      Console.warn(`Can't build for mobile on Windows. Skipping the following \
platforms: ${cordovaPlatforms.join(", ")}`);
      cordovaPlatforms = [];
    } else if (process.platform !== 'darwin' && _.contains(cordovaPlatforms, 'ios')) {
      cordovaPlatforms = _.without(cordovaPlatforms, 'ios');
      Console.warn("Currently, it is only possible to build iOS apps \
on an OS X system.");
    }

    if (!_.isEmpty(cordovaPlatforms)) {
      // XXX COMPAT WITH 0.9.2.2 -- the --mobile-port option is deprecated
      const mobileServerOption = options.server || options["mobile-port"];
      if (!mobileServerOption) {
        // For Cordova builds, require '--server'.
        // XXX better error message?
        Console.error(
          "Supply the server hostname and port in the --server option " +
            "for mobile app builds.");
        return 1;
      }
      parsedMobileServerUrl = parseMobileServerOption(mobileServerOption,
        'server');
    }
  } else {
    cordovaPlatforms = [];
  }

  var buildDir = projectContext.getProjectLocalDirectory('build_tar');
  var outputPath = files.pathResolve(options.args[0]); // get absolute path

  // Unless we're just making a tarball, warn if people try to build inside the
  // app directory.
  if (options.directory || ! _.isEmpty(cordovaPlatforms)) {
    var relative = files.pathRelative(options.appDir, outputPath);
    // We would like the output path to be outside the app directory, which
    // means the first step to getting there is going up a level.
    if (relative.substr(0, 3) !== ('..' + files.pathSep)) {
      Console.warn();
      Console.labelWarn(
        "The output directory is under your source tree.",
        "Your generated files may get interpreted as source code!",
        "Consider building into a different directory instead (" +
        Console.command("meteor build ../output") + ")",
        Console.options({ indent: 2 }));
      Console.warn();
    }
  }

  var bundlePath = options.directory ?
      (options._serverOnly ? outputPath :
      files.pathJoin(outputPath, 'bundle')) :
      files.pathJoin(buildDir, 'bundle');

  stats.recordPackages({
    what: "sdk.bundle",
    projectContext: projectContext
  });

  var bundler = require('../isobuild/bundler.js');
  var bundleResult = bundler.bundle({
    projectContext: projectContext,
    outputPath: bundlePath,
    buildOptions: {
      minifyMode: options.debug ? 'development' : 'production',
      // XXX is this a good idea, or should linux be the default since
      //     that's where most people are deploying
      //     default?  i guess the problem with using DEPLOY_ARCH as default
      //     is then 'meteor bundle' with no args fails if you have any local
      //     packages with binary npm dependencies
      serverArch: bundleArch,
      buildMode: options.debug ? 'development' : 'production',
    },
    providePackageJSONForUnavailableBinaryDeps: !!process.env.METEOR_BINARY_DEP_WORKAROUND,
  });
  if (bundleResult.errors) {
    Console.error("Errors prevented bundling:");
    Console.error(bundleResult.errors.formatMessages());
    return 1;
  }

  if (! options._serverOnly)
    files.mkdir_p(outputPath);

  if (! options.directory) {
    main.captureAndExit('', 'creating server tarball', () => {
      try {
        var outputTar = options._serverOnly ? outputPath :
          files.pathJoin(outputPath, appName + '.tar.gz');

        files.createTarball(files.pathJoin(buildDir, 'bundle'), outputTar);
      } catch (err) {
        buildmessage.exception(err);
        files.rm_recursive(buildDir);
      }
    });
  }

  if (!_.isEmpty(cordovaPlatforms)) {
    let cordovaProject;

    main.captureAndExit('', () => {
      buildmessage.enterJob({ title: "preparing Cordova project" }, () => {
        cordovaProject = new CordovaProject(projectContext, {
          settingsFile: options.settings,
          mobileServerUrl: utils.formatUrl(parsedMobileServerUrl) });

        const plugins = cordova.pluginVersionsFromStarManifest(
          bundleResult.starManifest);

        cordovaProject.prepareFromAppBundle(bundlePath, plugins);
      });

      for (platform of cordovaPlatforms) {
        buildmessage.enterJob(
          { title: `building Cordova app for \
${cordova.displayNameForPlatform(platform)}` }, () => {
            let buildOptions = [];
            if (!options.debug) buildOptions.push('--release');
            cordovaProject.buildForPlatform(platform, buildOptions);

            const buildPath = files.pathJoin(
              projectContext.getProjectLocalDirectory('cordova-build'),
              'platforms', platform);
            const platformOutputPath = files.pathJoin(outputPath, platform);

            files.cp_r(buildPath,
              files.pathJoin(platformOutputPath, 'project'));

            if (platform === 'ios') {
              files.writeFile(
                files.pathJoin(platformOutputPath, 'README'),
`This is an auto-generated XCode project for your iOS application.

Instructions for publishing your iOS app to App Store can be found at:
https://github.com/meteor/meteor/wiki/How-to-submit-your-iOS-app-to-App-Store
`, "utf8");
            } else if (platform === 'android') {
              const apkPath = files.pathJoin(buildPath, 'build/outputs/apk',
                options.debug ? 'android-debug.apk' : 'android-release-unsigned.apk')

              if (files.exists(apkPath)) {
              files.copyFile(apkPath, files.pathJoin(platformOutputPath,
                options.debug ? 'debug.apk' : 'release-unsigned.apk'));
              }

              files.writeFile(
                files.pathJoin(platformOutputPath, 'README'),
`This is an auto-generated Gradle project for your Android application.

Instructions for publishing your Android app to Play Store can be found at:
https://github.com/meteor/meteor/wiki/How-to-submit-your-Android-app-to-Play-Store
`, "utf8");
            }
        });
      }
    });
  }

  files.rm_recursive(buildDir);
};

///////////////////////////////////////////////////////////////////////////////
// lint
///////////////////////////////////////////////////////////////////////////////
main.registerCommand({
  name: 'lint',
  maxArgs: 0,
  requiresAppOrPackage: true,
  options: {
    'allow-incompatible-updates': { type: Boolean }
  },
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  const {packageDir, appDir} = options;

  let projectContext = null;

  // if the goal is to lint the package, don't include the whole app
  if (packageDir) {
    // similar to `meteor publish`, create a fake project
    const tempProjectDir = files.mkdtemp('meteor-package-build');
    projectContext = new projectContextModule.ProjectContext({
      projectDir: tempProjectDir,
      explicitlyAddedLocalPackageDirs: [packageDir],
      packageMapFilename: files.pathJoin(packageDir, '.versions'),
      alwaysWritePackageMap: true,
      forceIncludeCordovaUnibuild: true,
      allowIncompatibleUpdate: options['allow-incompatible-update'],
      lintPackageWithSourceRoot: packageDir
    });

    main.captureAndExit("=> Errors while setting up package:", () =>
      // Read metadata and initialize catalog.
      projectContext.initializeCatalog()
    );
    const versionRecord =
        projectContext.localCatalog.getVersionBySourceRoot(packageDir);
    if (! versionRecord) {
      throw Error("explicitly added local package dir missing?");
    }
    const packageName = versionRecord.packageName;
    const constraint = utils.parsePackageConstraint(packageName);
    projectContext.projectConstraintsFile.removeAllPackages();
    projectContext.projectConstraintsFile.addConstraints([constraint]);
  }

  // linting the app
  if (! projectContext && appDir) {
    projectContext = new projectContextModule.ProjectContext({
      projectDir: appDir,
      serverArchitectures: [archinfo.host()],
      allowIncompatibleUpdate: options['allow-incompatible-update'],
      lintAppAndLocalPackages: true
    });
  }


  main.captureAndExit("=> Errors prevented the build:", () => {
    projectContext.prepareProjectForBuild();
  });

  const bundlePath = projectContext.getProjectLocalDirectory('build');
  const bundler = require('../isobuild/bundler.js');
  const bundle = bundler.bundle({
    projectContext: projectContext,
    outputPath: null,
    buildOptions: {
      minifyMode: 'development'
    }
  });

  const displayName = options.packageDir ? 'package' : 'app';
  if (bundle.errors) {
    Console.error(
      `=> Errors building your ${displayName}:\n\n${bundle.errors.formatMessages()}`
    );
    throw new main.ExitWithCode(2);
  }

  if (bundle.warnings) {
    Console.warn(bundle.warnings.formatMessages());
    return 1;
  }

  return 0;
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
  },
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  var mongoUrl;
  var usedMeteorAccount = false;

  if (options.args.length === 0) {
    // localhost mode
    var findMongoPort =
      require('../runners/run-mongo.js').findMongoPort;
    var mongoPort = findMongoPort(options.appDir);

    // XXX detect the case where Meteor is running, but MONGO_URL was
    // specified?

    if (! mongoPort) {
      Console.info("mongo: Meteor isn't running a local MongoDB server.");
      Console.info();
      Console.info(`\
This command only works while Meteor is running your application locally. \
Start your application first with 'meteor' and then run this command in a new \
terminal. This error will also occur if you asked Meteor to use a different \
MongoDB server with $MONGO_URL when you ran your application.`);
      Console.info();
      Console.info(`\
If you're trying to connect to the database of an app you deployed with \
${Console.command("'meteor deploy'")}, specify your site's name as an argument \
to this command.`);
      return 1;
    }
    mongoUrl = "mongodb://127.0.0.1:" + mongoPort + "/meteor";

  } else {
    // remote mode
    var site = qualifySitename(options.args[0]);
    config.printUniverseBanner();

    mongoUrl = deploy.temporaryMongoUrl(site);
    usedMeteorAccount = true;

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
    var runMongo = require('../runners/run-mongo.js');
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
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  if (options.args.length !== 0) {
    Console.error("meteor reset only affects the locally stored database.");
    Console.error();
    Console.error("To reset a deployed application use");
    Console.error(
      Console.command("meteor deploy --delete appname"), Console.options({ indent: 2 }));
    Console.error("followed by");
    Console.error(
      Console.command("meteor deploy appname"), Console.options({ indent: 2 }));
    return 1;
  }

  // XXX detect the case where Meteor is running the app, but
  // MONGO_URL was set, so we don't see a Mongo process
  var findMongoPort = require('../runners/run-mongo.js').findMongoPort;
  var isRunning = !! findMongoPort(options.appDir);
  if (isRunning) {
    Console.error("reset: Meteor is running.");
    Console.error();
    Console.error(
      "This command does not work while Meteor is running your application.",
      "Exit the running Meteor development server.");
    return 1;
  }

  var localDir = files.pathJoin(options.appDir, '.meteor', 'local');
  files.rm_recursive(localDir);

  Console.info("Project reset.");
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
    // No longer supported, but we still parse it out so that we can
    // print a custom error message.
    password: { type: String },
    // Override architecture to deploy whatever stuff we have locally, even if
    // it contains binary packages that should be incompatible. A hack to allow
    // people to deploy from checkout or do other weird shit. We are not
    // responsible for the consequences.
    'override-architecture-with-local' : { type: Boolean },
    'allow-incompatible-update': { type: Boolean }
  },
  requiresApp: function (options) {
    return ! options.delete;
  },
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  var site = qualifySitename(options.args[0]);
  config.printUniverseBanner();

  if (options.delete) {
    return deploy.deleteApp(site);
  }

  if (options.password) {
    Console.error(
      "Setting passwords on apps is no longer supported. Now there are " +
        "user accounts and your apps are associated with your account so " +
        "that only you (and people you designate) can access them. See the " +
        Console.command("'meteor claim'") + " and " +
        Console.command("'meteor authorized'") + " commands.");
    return 1;
  }

  var loggedIn = auth.isLoggedIn();
  if (! loggedIn) {
    Console.error(
      "To instantly deploy your app on a free testing server,",
      "just enter your email address!");
    Console.error();
    if (! auth.registerOrLogIn())
      return 1;
  }

  // Override architecture iff applicable.
  var buildArch = DEPLOY_ARCH;
  if (options['override-architecture-with-local']) {
    Console.warn();
    Console.labelWarn(
      "OVERRIDING DEPLOY ARCHITECTURE WITH LOCAL ARCHITECTURE.",
      "If your app contains binary code, it may break in unexpected " +
      "and terrible ways.");
    buildArch = archinfo.host();
  }

  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    serverArchitectures: _.uniq([buildArch, archinfo.host()]),
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });

  main.captureAndExit("=> Errors while initializing project:", function () {
    projectContext.prepareProjectForBuild();
  });
  projectContext.packageMapDelta.displayOnConsole();

  var buildOptions = {
    minifyMode: options.debug ? 'development' : 'production',
    buildMode: options.debug ? 'development' : 'production',
    serverArch: buildArch
  };

  var deployResult = deploy.bundleAndDeploy({
    projectContext: projectContext,
    site: site,
    settingsFile: options.settings,
    buildOptions: buildOptions
  });

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
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  var site = qualifySitename(options.args[0]);

  return deploy.logs(site);
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
  },
  pretty: function (options) {
    // pretty if we're mutating; plain if we're listing (which is more likely to
    // be used by scripts)
    return options.add || options.remove;
  },
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {

  if (options.add && options.remove) {
    Console.error(
      "Sorry, you can only add or remove one user at a time.");
    return 1;
  }

  if ((options.add || options.remove) && options.list) {
    Console.error(
      "Sorry, you can't change the users at the same time as",
      "you're listing them.");
    return 1;
  }

  config.printUniverseBanner();
  auth.pollForRegistrationCompletion();
  var site = qualifySitename(options.args[0]);

  if (! auth.isLoggedIn()) {
    Console.error(
      "You must be logged in for that. Try " +
      Console.command("'meteor login'"));
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
  maxArgs: 1,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  config.printUniverseBanner();
  auth.pollForRegistrationCompletion();
  var site = qualifySitename(options.args[0]);

  if (! auth.isLoggedIn()) {
    Console.error(
      "You must be logged in to claim sites. Use " +
      Console.command("'meteor login'") + " to log in. If you don't have a " +
      "Meteor developer account yet, create one by clicking " +
      Console.command("'Sign in'") + " and then " +
      Console.command("'Create account'") + " at www.meteor.com.");
    Console.error();
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
    port: { type: String, short: "p", default: DEFAULT_PORT },
    'mobile-server': { type: String },
    // XXX COMPAT WITH 0.9.2.2
    'mobile-port': { type: String },
    'debug-port': { type: String },
    deploy: { type: String },
    production: { type: Boolean },
    settings: { type: String },
    velocity: { type: Boolean },
    verbose: { type: Boolean, short: "v" },

    // Undocumented. See #Once
    once: { type: Boolean },
    // Undocumented. To ensure that QA covers both
    // PollingObserveDriver and OplogObserveDriver, this option
    // disables oplog for tests.  (It still creates a replset, it just
    // doesn't do oplog tailing.)
    'disable-oplog': { type: Boolean },
    // Undocumented flag to use a different test driver.
    'driver-package': { type: String, default: 'test-in-browser' },

    // Sets the path of where the temp app should be created
    'test-app-path': { type: String },

    // Undocumented, runs tests under selenium
    'selenium': { type: Boolean },
    'selenium-browser': { type: String },

    // Undocumented.  Usually we just show a banner saying 'Tests' instead of
    // the ugly path to the temporary test directory, but if you actually want
    // to see it you can ask for it.
    'show-test-app-path': { type: Boolean },

    // hard-coded options with all known Cordova platforms
    ios: { type: Boolean },
    'ios-device': { type: Boolean },
    android: { type: Boolean },
    'android-device': { type: Boolean },

    // This could theoretically be useful/necessary in conjunction with
    // --test-app-path.
    'allow-incompatible-update': { type: Boolean },

    // Don't print linting messages for tested packages
    'no-lint': { type: Boolean },

    // allow excluding packages when testing all packages.
    // should be a comma-separated list of package names.
    'exclude': { type: String }
  },
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.setVerbose(!!options.verbose);

  const runTargets = parseRunTargets(_.intersection(
    Object.keys(options), ['ios', 'ios-device', 'android', 'android-device']));

  const { parsedServerUrl, parsedMobileServerUrl } =
    parseServerOptionsForRunCommand(options, runTargets);

  // Find any packages mentioned by a path instead of a package name. We will
  // load them explicitly into the catalog.
  var packagesByPath = _.filter(options.args, function (p) {
    return p.indexOf('/') !== -1;
  });

  // Make a temporary app dir (based on the test runner app). This will be
  // cleaned up on process exit. Using a temporary app dir means that we can
  // run multiple "test-packages" commands in parallel without them stomping
  // on each other.
  var testRunnerAppDir =
        options['test-app-path'] || files.mkdtemp('meteor-test-run');

  // Download packages for our architecture, and for the deploy server's
  // architecture if we're deploying.
  var serverArchitectures = [archinfo.host()];
  if (options.deploy && DEPLOY_ARCH !== archinfo.host())
    serverArchitectures.push(DEPLOY_ARCH);

  // XXX Because every run uses a new app with its own IsopackCache directory,
  //     this always does a clean build of all packages. Maybe we can speed up
  //     repeated test-packages calls with some sort of shared or semi-shared
  //     isopack cache that's specific to test-packages?  See #3012.
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: testRunnerAppDir,
    // If we're currently in an app, we still want to use the real app's
    // packages subdirectory, not the test runner app's empty one.
    projectDirForLocalPackages: options.appDir,
    explicitlyAddedLocalPackageDirs: packagesByPath,
    serverArchitectures: serverArchitectures,
    allowIncompatibleUpdate: options['allow-incompatible-update'],
    lintAppAndLocalPackages: !options['no-lint']
  });

  main.captureAndExit("=> Errors while setting up tests:", function () {
    // Read metadata and initialize catalog.
    projectContext.initializeCatalog();
  });

  // Overwrite .meteor/release.
  projectContext.releaseFile.write(
    release.current.isCheckout() ? "none" : release.current.name);

  var packagesToAdd = getTestPackageNames(projectContext, options.args);

  // filter out excluded packages
  var excludedPackages = options.exclude && options.exclude.split(',');
  if (excludedPackages) {
    packagesToAdd = _.filter(packagesToAdd, function (p) {
      return ! _.some(excludedPackages, function (excluded) {
        return p.replace(/^local-test:/, '') === excluded;
      });
    });
  }

  // Use the driver package
  // Also, add `autoupdate` so that you don't have to manually refresh the tests
  packagesToAdd.unshift("autoupdate", options['driver-package']);
  var constraintsToAdd = _.map(packagesToAdd, function (p) {
    return utils.parsePackageConstraint(p);
  });
  // Add the packages to our in-memory representation of .meteor/packages.  (We
  // haven't yet resolved constraints, so this will affect constraint
  // resolution.)  This will get written to disk once we prepareProjectForBuild,
  // either in the Cordova code below, right before deploying below, or in the
  // app runner.  (Note that removeAllPackages removes any comments from
  // .meteor/packages, but that's OK since this isn't a real user project.)
  projectContext.projectConstraintsFile.removeAllPackages();
  projectContext.projectConstraintsFile.addConstraints(constraintsToAdd);
  // Write these changes to disk now, so that if the first attempt to prepare
  // the project for build hits errors, we don't lose them on
  // projectContext.reset.
  projectContext.projectConstraintsFile.writeIfModified();

  // The rest of the projectContext preparation process will happen inside the
  // runner, once the proxy is listening. The changes we made were persisted to
  // disk, so projectContext.reset won't make us forget anything.

  let cordovaRunner;

  if (!_.isEmpty(runTargets)) {
    main.captureAndExit('', 'preparing Cordova project', () => {
      const cordovaProject = new CordovaProject(projectContext, {
        settingsFile: options.settings,
        mobileServerUrl: utils.formatUrl(parsedMobileServerUrl) });

      cordovaRunner = new CordovaRunner(cordovaProject, runTargets);
      projectContext.platformList.write(cordovaRunner.platformsForRunTargets);
      cordovaRunner.checkPlatformsForRunTargets();
    });
  }

  options.cordovaRunner = cordovaRunner;

  if (options.velocity) {
    const serverUrlForVelocity =
    `http://${(parsedServerUrl.host || "localhost")}:${parsedServerUrl.port}`;
    const velocity = require('../runners/run-velocity.js');
    velocity.runVelocity(serverUrlForVelocity);
  }

  return runTestAppForPackages(projectContext, _.extend(
    options,
    { mobileServerUrl: utils.formatUrl(parsedMobileServerUrl) }));
});

// Returns the "local-test:*" package names for the given package names (or for
// all local packages if packageNames is empty/unspecified).
var getTestPackageNames = function (projectContext, packageNames) {
  var packageNamesSpecifiedExplicitly = ! _.isEmpty(packageNames);
  if (_.isEmpty(packageNames)) {
    // If none specified, test all local packages. (We don't have tests for
    // non-local packages.)
    packageNames = projectContext.localCatalog.getAllPackageNames();
  }
  var testPackages = [];
  main.captureAndExit("=> Errors while collecting tests:", function () {
    _.each(packageNames, function (p) {
      buildmessage.enterJob("trying to test package `" + p + "`", function () {
        // If it's a package name, look it up the normal way.
        if (p.indexOf('/') === -1) {
          if (p.indexOf('@') !== -1) {
            buildmessage.error(
              "You may not specify versions for local packages: " + p );
            return;  // recover by ignoring
          }
          // Check to see if this is a real local package, and if it is a real
          // local package, if it has tests.
          var version = projectContext.localCatalog.getLatestVersion(p);
          if (! version) {
            buildmessage.error("Not a known local package, cannot test");
          } else if (version.testName) {
            testPackages.push(version.testName);
          } else if (packageNamesSpecifiedExplicitly) {
            // It's only an error to *ask* to test a package with no tests, not
            // to come across a package with no tests when you say "test all
            // packages".
            buildmessage.error("Package has no tests");
          }
        } else {
          // Otherwise, it's a directory; find it by source root.
          version = projectContext.localCatalog.getVersionBySourceRoot(
            files.pathResolve(p));
          if (! version) {
            throw Error("should have been caught when initializing catalog?");
          }
          if (version.testName) {
            testPackages.push(version.testName);
          }
          // It is not an error to mention a package by directory that is a
          // package but has no tests; this means you can run `meteor
          // test-packages $APP/packages/*` without having to worry about the
          // packages that don't have tests.
        }
      });
    });
  });

  return testPackages;
};

var runTestAppForPackages = function (projectContext, options) {
  var buildOptions = {
    minifyMode: options.production ? 'production' : 'development',
    buildMode: options.production ? 'production' : 'development',
  };

  if (options.deploy) {
    // Run the constraint solver and build local packages.
    main.captureAndExit("=> Errors while initializing project:", function () {
      projectContext.prepareProjectForBuild();
    });
    // No need to display the PackageMapDelta here, since it would include all
    // of the packages!

    buildOptions.serverArch = DEPLOY_ARCH;
    return deploy.bundleAndDeploy({
      projectContext: projectContext,
      site: options.deploy,
      settingsFile: options.settings,
      buildOptions: buildOptions,
      recordPackageUsage: false
    });
  } else {
    var runAll = require('../runners/run-all.js');
    return runAll.run({
      projectContext: projectContext,
      proxyPort: options.port,
      debugPort: options['debug-port'],
      disableOplog: options['disable-oplog'],
      settingsFile: options.settings,
      banner: options['show-test-app-path'] ? null : "Tests",
      buildOptions: buildOptions,
      rootUrl: process.env.ROOT_URL,
      mongoUrl: process.env.MONGO_URL,
      oplogUrl: process.env.MONGO_OPLOG_URL,
      mobileServerUrl: options.mobileServerUrl,
      once: options.once,
      recordPackageUsage: false,
      selenium: options.selenium,
      seleniumBrowser: options['selenium-browser'],
      cordovaRunner: options.cordovaRunner,
      // On the first run, we shouldn't display the delta between "no packages
      // in the temp app" and "all the packages we're testing". If we make
      // changes and reload, though, it's fine to display them.
      omitPackageMapDeltaDisplayOnFirstRun: true
    });
  }
};

///////////////////////////////////////////////////////////////////////////////
// rebuild
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'rebuild',
  maxArgs: Infinity,
  hidden: true,
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never(),
  'allow-incompatible-update': { type: Boolean }
}, function (options) {
  var projectContextModule = require('../project-context.js');
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    forceRebuildPackages: options.args.length ? options.args : true,
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });

  main.captureAndExit("=> Errors while rebuilding packages:", function () {
    projectContext.prepareProjectForBuild();
  });
  projectContext.packageMapDelta.displayOnConsole();

  Console.info("Packages rebuilt.");
});

///////////////////////////////////////////////////////////////////////////////
// login
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'login',
  options: {
    email: { type: Boolean }
  },
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  return auth.loginCommand(_.extend({
    overwriteExistingToken: true
  }, options));
});


///////////////////////////////////////////////////////////////////////////////
// logout
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'logout',
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  return auth.logoutCommand(options);
});


///////////////////////////////////////////////////////////////////////////////
// whoami
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'whoami',
  catalogRefresh: new catalog.Refresh.Never(),
  pretty: false
}, function (options) {
  return auth.whoAmICommand(options);
});

///////////////////////////////////////////////////////////////////////////////
// organizations
///////////////////////////////////////////////////////////////////////////////

var loggedInAccountsConnectionOrPrompt = function (action) {
  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    Console.error("You must be logged in to " + action + ".");
    auth.doUsernamePasswordLogin({ retry: true });
    Console.info();
  }

  token = auth.getSessionToken(config.getAccountsDomain());
  var conn = auth.loggedInAccountsConnection(token);
  if (conn === null) {
    // Server rejected our token.
    Console.error("You must be logged in to " + action + ".");
    auth.doUsernamePasswordLogin({ retry: true });
    Console.info();
    token = auth.getSessionToken(config.getAccountsDomain());
    conn = auth.loggedInAccountsConnection(token);
  }

  return conn;
};

// List the organizations of which the current user is a member.
main.registerCommand({
  name: 'admin list-organizations',
  minArgs: 0,
  maxArgs: 0,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {

  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    Console.error("You must be logged in to list your organizations.");
    auth.doUsernamePasswordLogin({ retry: true });
    Console.info();
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
    Console.error("Error listing organizations.");
    return 1;
  }

  if (result.response.statusCode === 401 &&
      body && body.error === "invalid_credential") {
    Console.error("You must be logged in to list your organizations.");
    // XXX It would be nice to do a username/password prompt here like
    // we do for the other orgs commands.
    return 1;
  }

  if (result.response.statusCode !== 200 ||
      ! body || ! body.organizations) {
    Console.error("Error listing organizations.");
    return 1;
  }

  if (body.organizations.length === 0) {
    Console.info("You are not a member of any organizations.");
  } else {
    Console.rawInfo(_.pluck(body.organizations, "name").join("\n") + "\n");
  }
  return 0;
});

main.registerCommand({
  name: 'admin members',
  minArgs: 1,
  maxArgs: 1,
  options: {
    add: { type: String },
    remove: { type: String },
    list: { type: Boolean }
  },
  pretty: function (options) {
    // pretty if we're mutating; plain if we're listing (which is more likely to
    // be used by scripts)
    return options.add || options.remove;
  },
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {

  if (options.add && options.remove) {
    Console.error(
      "Sorry, you can only add or remove one member at a time.");
    throw new main.ShowUsage;
  }

  config.printUniverseBanner();

  var username = options.add || options.remove;

  var conn = loggedInAccountsConnectionOrPrompt(
    username ? "edit organizations" : "show an organization's members");

  if (username ) {
    // Adding or removing members
    try {
      conn.call(
        options.add ? "addOrganizationMember": "removeOrganizationMember",
        options.args[0], username);
    } catch (err) {
      Console.error("Error " +
                    (options.add ? "adding" : "removing") +
                    " member: " + err.reason);
      return 1;
    }

    Console.info(username + " " +
                         (options.add ? "added to" : "removed from") +
                         " organization " + options.args[0] + ".");
  } else {
    // Showing the members of an org
    try {
      var result = conn.call("showOrganization", options.args[0]);
    } catch (err) {
      Console.error("Error showing organization: " + err.reason);
      return 1;
    }

    var members = _.pluck(result, "username");
    Console.rawInfo(members.join("\n") + "\n");
  }

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
    galaxy: { type: Boolean },
    browserstack: { type: Boolean },
    history: { type: Number },
    list: { type: Boolean },
    file: { type: String },
    exclude: { type: String }
  },
  hidden: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  if (! files.inCheckout()) {
    Console.error("self-test is only supported running from a checkout");
    return 1;
  }

  var selftest = require('../tool-testing/selftest.js');

  // Auto-detect whether to skip 'net' tests, unless --force-online is passed.
  var offline = false;
  if (!options['force-online']) {
    try {
      require('../utils/http-helpers.js').getUrl("http://www.google.com/");
    } catch (e) {
      if (e instanceof files.OfflineError)
        offline = true;
    }
  }

  var compileRegexp = function (str) {
    try {
      return new RegExp(str);
    } catch (e) {
      if (!(e instanceof SyntaxError))
        throw e;
      Console.error("Bad regular expression: " + str);
      return null;
    }
  };

  var testRegexp = undefined;
  if (options.args.length) {
    testRegexp = compileRegexp(options.args[0]);
    if (! testRegexp) {
      return 1;
    }
  }

  var fileRegexp = undefined;
  if (options.file) {
    fileRegexp = compileRegexp(options.file);
    if (! fileRegexp) {
      return 1;
    }
  }

  var excludeRegexp = undefined;
  if (options.exclude) {
    excludeRegexp = compileRegexp(options.exclude);
    if (! excludeRegexp) {
      return 1;
    }
  }

  if (options.list) {
    selftest.listTests({
      onlyChanged: options.changed,
      offline: offline,
      includeSlowTests: options.slow,
      galaxyOnly: options.galaxy,
      testRegexp: testRegexp,
      fileRegexp: fileRegexp
    });

    return 0;
  }

  var clients = {
    browserstack: options.browserstack
  };

  return selftest.runTests({
    // filtering options
    onlyChanged: options.changed,
    offline: offline,
    includeSlowTests: options.slow,
    galaxyOnly: options.galaxy,
    testRegexp: testRegexp,
    fileRegexp: fileRegexp,
    excludeRegexp: excludeRegexp,
    // other options
    historyLines: options.history,
    clients: clients
  });

});

///////////////////////////////////////////////////////////////////////////////
// list-sites
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'list-sites',
  minArgs: 0,
  maxArgs: 0,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  auth.pollForRegistrationCompletion();
  if (! auth.isLoggedIn()) {
    Console.error(
      "You must be logged in for that. Try " +
      Console.command("'meteor login'") + ".");
    return 1;
  }

  return deploy.listSites();
});


///////////////////////////////////////////////////////////////////////////////
// admin get-machine
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'admin get-machine',
  minArgs: 1,
  maxArgs: 1,
  options: {
    json: { type: Boolean },
    verbose: { type: Boolean, short: "v" },
    // By default, we give you a machine for 5 minutes. You can request up to
    // 15. (MDG can reserve machines for longer than that.)
    minutes: { type: Number }
  },
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {

  // Check that we are asking for a valid architecture.
  var arch = options.args[0];
  if (!_.has(VALID_ARCHITECTURES, arch)){
    showInvalidArchMsg(arch);
    return 1;
  }

  // Set the minutes. We will check validity on the server.
  var minutes = options.minutes || 5;

  // In verbose mode, we let you know what is going on.
  var maybeLog = function (string) {
    if (options.verbose) {
      Console.info(string);
    }
  };

  try {
    maybeLog("Logging into the get-machines server ...");
    var conn = authClient.loggedInConnection(
      config.getBuildFarmUrl(),
      config.getBuildFarmDomain(),
      "build-farm");
  } catch (err) {
    authClient.handleConnectionError(err, "get-machines server");
    return 1;
  }

  try {
    maybeLog("Reserving machine ...");

    // The server returns to us an object with the following keys:
    // username & sshKey : use this to log in.
    // host: what you login into
    // port: port you should use
    // hostKey: RSA key to compare for safety.
    var ret = conn.call('createBuildServer', arch, minutes);
  } catch (err) {
    authClient.handleConnectionError(err, "build farm");
    return 1;
  }
  conn.close();

  // Possibly, the user asked us to return a JSON of the data and is going to process it
  // themselves. In that case, let's do that and exit.
  if (options.json) {
    var retJson = {
      'username': ret.username,
      'host' : ret.host,
      'port' : ret.port,
      'key' : ret.sshKey,
      'hostKey' : ret.hostKey
    };
    Console.rawInfo(JSON.stringify(retJson, null, 2) + "\n");
    return 0;
  }

  // Record the SSH Key in a temporary file on disk and give it the permissions
  // that ssh-agent requires it to have.
  var tmpDir = files.mkdtemp('meteor-ssh-');
  var idpath = tmpDir + '/id';
  maybeLog("Writing ssh key to " + idpath);
  files.writeFile(idpath, ret.sshKey, {encoding: 'utf8', mode: 0o400});

  // Add the known host key to a custom known hosts file.
  var hostpath = tmpDir + '/host';
  var addendum = ret.host + " " + ret.hostKey + "\n";
  maybeLog("Writing host key to " + hostpath);
  files.writeFile(hostpath, addendum, 'utf8');

  // Finally, connect to the machine.
  var login = ret.username + "@" + ret.host;
  var maybeVerbose = options.verbose ? "-v" : "-q";

  var connOptions = [
    login,
     "-i" + idpath,
     "-p" + ret.port,
     "-oUserKnownHostsFile=" + hostpath,
     maybeVerbose];

  var printOptions = connOptions.join(' ');
  maybeLog("Connecting: " + Console.command("ssh " + printOptions));

  var child_process = require('child_process');
  var future = new Future;

  if (arch.match(/win/)) {
    // The ssh output from Windows machines is buggy, it can overlay your
    // existing output on the top of the screen which is very ugly. Force the
    // screen cleaning to assist.
    Console.clear();
  }

  var sshCommand = child_process.spawn(
    "ssh", connOptions,
    { stdio: 'inherit' }); // Redirect spawn stdio to process

  sshCommand.on('error', function (err) {
    if (err.code === "ENOENT") {
      if (process.platform === "win32") {
        Console.error("Could not find the `ssh` command in your PATH.",
          "Please read this page about using the get-machine command on Windows:",
          Console.url("https://github.com/meteor/meteor/wiki/Accessing-Meteor-provided-build-machines-from-Windows"));
      } else {
        Console.error("Could not find the `ssh` command in your PATH.");
      }

      future.return(1);
    }
  });

  sshCommand.on('exit', function (code, signal) {
    if (signal) {
      // XXX: We should process the signal in some way, but I am not sure we
      // care right now.
      future.return(1);
    } else {
      future.return(code);
    }
  });
  var sshEnd = future.wait();

  return sshEnd;
});


///////////////////////////////////////////////////////////////////////////////
// admin progressbar-test
///////////////////////////////////////////////////////////////////////////////

// A test command to print a progressbar. Useful for manual testing.
main.registerCommand({
  name: 'admin progressbar-test',
  options: {
    secs: { type: Number, default: 20 },
    spinner: { type: Boolean, default: false }
  },
  hidden: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  buildmessage.enterJob({ title: "A test progressbar" }, function () {
    var doneFuture = new Future;
    var progress = buildmessage.getCurrentProgressTracker();
    var totalProgress = { current: 0, end: options.secs, done: false };
    var i = 0;
    var n = options.secs;

    if (options.spinner) {
      totalProgress.end = undefined;
    }

    var updateProgress = function () {
      i++;
      if (! options.spinner) {
        totalProgress.current = i;
      }

      if (i === n) {
        totalProgress.done = true;
        progress.reportProgress(totalProgress);
        doneFuture.return();
      } else {
        progress.reportProgress(totalProgress);
        setTimeout(updateProgress, 1000);
      }
    };
    setTimeout(updateProgress);
    doneFuture.wait();
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
    ething: { type: String, short: "e", required: true },
    port: { type: Number, short: "p", default: DEFAULT_PORT },
    url: { type: Boolean, short: "U" },
    'delete': { type: Boolean, short: "D" },
    changed: { type: Boolean }
  },
  maxArgs: 2,
  hidden: true,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  var p = function (key) {
    if (_.has(options, key))
      return JSON.stringify(options[key]);
    return 'none';
  };

  Console.info(p('ething') + " " + p('port') + " " + p('changed') +
                       " " + p('args'));
  if (options.url)
    Console.info('url');
  if (options['delete'])
    Console.info('delete');
});

///////////////////////////////////////////////////////////////////////////////
// throw-error
///////////////////////////////////////////////////////////////////////////////

// Dummy test command. Used to test that stack traces work from an installed
// Meteor tool.

main.registerCommand({
  name: 'throw-error',
  hidden: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function () {
  throw new Error("testing stack traces!"); // #StackTraceTest this line is found in tests/source-maps.js
});
