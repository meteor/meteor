var main = require('./main.js');
var _ = require('underscore');
var files = require('../fs/files');
var deploy = require('../meteor-services/deploy.js');
var buildmessage = require('../utils/buildmessage.js');
var auth = require('../meteor-services/auth.js');
var config = require('../meteor-services/config.js');
var runLog = require('../runners/run-log.js');
var utils = require('../utils/utils.js');
var httpHelpers = require('../utils/http-helpers.js');
var archinfo = require('../utils/archinfo');
var catalog = require('../packaging/catalog/catalog.js');
var stats = require('../meteor-services/stats.js');
var Console = require('../console/console.js').Console;
const {
  blue,
  green,
  purple,
  red,
  yellow
} = require('../console/console.js').colors;
const inquirer = require('inquirer');

var projectContextModule = require('../project-context.js');
var release = require('../packaging/release.js');

const { Profile } = require("../tool-env/profile");
const open = require('open')

const { exec } = require("child_process");
/**
 * Run a command in the shell.
 * @param command
 * @return {Promise<string>}
 */
const runCommand = async (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(red`error: ${ error.message }`);
        reject(error);
        return;
      }
      if (stderr) {
        if (stderr.includes("Cloning into")) console.log(green`${ stderr }`);
        else console.log(red`stderr: ${ stderr }`);
        reject(stderr);
        return;
      }
      resolve(stdout);
    });
  })
}
/**
 *
 * @param {Promise<<T>() => T>} fn
 * @returns {Promise<[T, null]> | Promise<[null, Error]>}
 */
const tryRun = async (fn) => {
  try { return [await fn(), null] } catch (e) { return [null, e] }
}

/**
 *
 * @param {string} bash command
 * @param  {[string, null] | [null, Error]}} Result or Error
 * @returns
 */
const bash =
  (text, ...values) =>
    tryRun(() => runCommand(String.raw({ raw: text }, ...values)));

import { ensureDevBundleDependencies } from '../cordova/index.js';
import { CordovaRunner } from '../cordova/runner.js';
import { iOSRunTarget, AndroidRunTarget } from '../cordova/run-targets.js';

import { EXAMPLE_REPOSITORIES } from './example-repositories.js';

// The architecture used by Meteor Software's hosted servers; it's the
// architecture used by 'meteor deploy'.
var DEPLOY_ARCH = 'os.linux.x86_64';

// The default port that the development server listens on.
var DEFAULT_PORT = '3000';

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
  if (site.indexOf(".") === -1) {
    site = site + ".meteor.com";
  }
  while (site.length && site[site.length - 1] === ".") {
    site = site.substring(0, site.length - 1);
  }
  return site;
};

// Display a message showing valid Meteor architectures.
var showInvalidArchMsg = function (arch) {
  Console.info("Invalid architecture: " + arch);
  Console.info("The following are valid Meteor architectures:");
  Object.keys(archinfo.VALID_ARCHITECTURES).forEach(function (va) {
    Console.info(
      Console.command(va),
      Console.options({ indent: 2 }));
  });
};

// Utility functions to parse options in run/build/test-packages commands

export function parseServerOptionsForRunCommand(options, runTargets) {
  const parsedServerUrl = parsePortOption(options.port);

  const mobileServerOption = options['mobile-server'];
  let parsedMobileServerUrl;
  if (mobileServerOption) {
    parsedMobileServerUrl = parseMobileServerOption(mobileServerOption);
  } else {
    const isRunOnDeviceRequested = _.any(runTargets,
      runTarget => runTarget.isDevice);
    parsedMobileServerUrl = detectMobileServerUrl(parsedServerUrl,
      isRunOnDeviceRequested);
  }

  const parsedCordovaServerPort = parseCordovaServerPortOption(options);

  return { parsedServerUrl, parsedMobileServerUrl, parsedCordovaServerPort };
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
    { protocol: 'http' });

  if (!parsedMobileServerUrl.hostname) {
    Console.error(`--${optionName} must include a hostname.`);
    throw new main.ExitWithCode(1);
  }

  return parsedMobileServerUrl;
}

function parseCordovaServerPortOption(options = {}) {
  const cordovaServerPortOption = options['cordova-server-port'];
  return cordovaServerPortOption ? parseInt(cordovaServerPortOption, 10) : null;
}

function detectMobileServerUrl(parsedServerUrl, isRunOnDeviceRequested) {
  // Always try to use an auto-detected IP first
  try {
    const myIp = utils.ipAddress();
    return {
      protocol: 'http',
      hostname: myIp,
      port: parsedServerUrl.port
    };
  } catch (error) {
    // Unless we are being asked to run on a device, use localhost as fallback
    if (isRunOnDeviceRequested) {
      Console.error(
`Error detecting IP address for mobile app to connect to:
${error.message}
Please specify the address that the mobile app should connect
to with --mobile-server.`);
      throw new main.ExitWithCode(1);
    } else {
      return {
        protocol: 'http',
        hostname: 'localhost',
        port: parsedServerUrl.port
      };
    }
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

const excludableWebArchs = ['web.browser', 'web.browser.legacy', 'web.cordova'];
function filterWebArchs(webArchs, excludeArchsOption) {
  if (excludeArchsOption) {
    const excludeArchs = excludeArchsOption.trim().split(/\s*,\s*/)
      .filter(arch => excludableWebArchs.includes(arch));
    webArchs = webArchs.filter(arch => !excludeArchs.includes(arch));
  }
  return webArchs;
}

///////////////////////////////////////////////////////////////////////////////
// options that act like commands
///////////////////////////////////////////////////////////////////////////////

// Prints the Meteor architecture name of this host
main.registerCommand({
  name: '--arch',
  requiresRelease: false,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function () {
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
}, async function (options) {
  if (release.current === null) {
    if (! options.appDir) {
      throw new Error("missing release, but not in an app?");
    }
    Console.error(
      "This project was created with a checkout of Meteor, rather than an " +
      "official release, and doesn't have a release number associated with " +
      "it. You can set its release with " +
      Console.command("'meteor update'") + ".");
    return 1;
  }

  if (release.current.isCheckout()) {
    var gitLog = (await utils.runGitInCheckout(
      'log',
      '--format=%h%d', '-n 1')).trim();
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

const inspectOptions = {
  "inspect": { type: String, implicitValue: "9229" },
  "inspect-brk": { type: String, implicitValue: "9229" },
};

function normalizeInspectOptions(options) {
  const result = Object.create(null);

  if (_.has(options, "debug-port")) {
    console.log(
      "The --debug-port option is deprecated; " +
        "please use --inspect-brk=<port> instead."
    );

    if (! _.has(options, "inspect-brk")) {
      options["inspect-brk"] = options["debug-port"];
    }

    delete options["debug-port"];
  }

  if (_.has(options, "inspect-brk")) {
    result.inspect = {
      port: options["inspect-brk"],
      "break": true,
    };

    if (_.has(options, "inspect")) {
      console.log(
        "Both --inspect and --inspect-brk provided; " +
          "ignoring --inspect."
      );

      delete options.inspect;
    }

  } else if (_.has(options, "inspect")) {
    result.inspect = {
      port: options.inspect,
      "break": false,
    };
  }

  return result;
}

var runCommandOptions = {
  requiresApp: true,
  maxArgs: Infinity,
  options: {
    port: { type: String, short: "p", default: DEFAULT_PORT },
    open: { type: Boolean, short: "o", default: false },
    'mobile-server': { type: String },
    'cordova-server-port': { type: String },
    'app-port': { type: String },
    'debug-port': { type: String },
    ...inspectOptions,
    'no-release-check': { type: Boolean },
    production: { type: Boolean },
    'raw-logs': { type: Boolean },
    settings: { type: String, short: "s" },
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
    'allow-incompatible-update': { type: Boolean },
    'extra-packages': { type: String },
    'exclude-archs': { type: String },
  },
  catalogRefresh: new catalog.Refresh.Never()
};

main.registerCommand(Object.assign(
  { name: 'run' },
  runCommandOptions
), doRunCommand);

async function doRunCommand(options) {
  Console.setVerbose(!!options.verbose);

  // Additional args are interpreted as run targets
  const runTargets = parseRunTargets(options.args);

  const { parsedServerUrl, parsedMobileServerUrl, parsedCordovaServerPort } =
    parseServerOptionsForRunCommand(options, runTargets);

  var includePackages = [];
  if (options['extra-packages']) {
    includePackages = options['extra-packages'].trim().split(/\s*,\s*/);
  }

  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    allowIncompatibleUpdate: options['allow-incompatible-update'],
    lintAppAndLocalPackages: !options['no-lint'],
    includePackages: includePackages,
  });

  await main.captureAndExit("=> Errors while initializing project:", function () {
    // We're just reading metadata here --- we'll wait to do the full build
    // preparation until after we've started listening on the proxy, etc.
    return projectContext.readProjectMetadata();
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

  if (options.production) {
    Console.warn(
      "Warning: The --production flag should only be used to simulate production " +
      "bundling for testing purposes. Use meteor build to create a bundle for " +
      "production deployment. See: https://guide.meteor.com/deployment.html"
    );
  }

  if (options['raw-logs']) {
    runLog.setRawLogs(true);
  }


  let webArchs = projectContext.platformList.getWebArchs();
  if (! _.isEmpty(runTargets) ||
      options['mobile-server']) {
    if (webArchs.indexOf("web.cordova") < 0) {
      webArchs.push("web.cordova");
    }
  }
  webArchs = filterWebArchs(webArchs, options['exclude-archs']);
  const buildMode = options.production ? 'production' : 'development';

  let cordovaRunner;
  if (!_.isEmpty(runTargets)) {

    async function prepareCordovaProject() {
      import { CordovaProject } from '../cordova/project.js';

      await main.captureAndExit('', 'preparing Cordova project', async () => {
        // TODO -> Have to change CordovaProject constructor here.
        const cordovaProject = new CordovaProject(projectContext, {
          settingsFile: options.settings,
          mobileServerUrl: utils.formatUrl(parsedMobileServerUrl),
          cordovaServerPort: parsedCordovaServerPort,
          buildMode
        });
        await cordovaProject.init();
        if (buildmessage.jobHasMessages()) return;

        cordovaRunner = new CordovaRunner(cordovaProject, runTargets);
        await cordovaRunner.checkPlatformsForRunTargets();
      });
    }

    await ensureDevBundleDependencies();
    await prepareCordovaProject();
  }

  var runAll = require('../runners/run-all.js');
  return runAll.run({
    projectContext: projectContext,
    proxyPort: parsedServerUrl.port,
    proxyHost: parsedServerUrl.hostname,
    appPort: appPort,
    appHost: appHost,
    ...normalizeInspectOptions(options),
    settingsFile: options.settings,
    buildOptions: {
      minifyMode: options.production ? 'production' : 'development',
      buildMode,
      webArchs: webArchs
    },
    rootUrl: process.env.ROOT_URL,
    mongoUrl: process.env.MONGO_URL,
    oplogUrl: process.env.MONGO_OPLOG_URL,
    mobileServerUrl: utils.formatUrl(parsedMobileServerUrl),
    cordovaServerPort: parsedCordovaServerPort,
    once: options.once,
    noReleaseCheck: options['no-release-check'] || process.env.METEOR_NO_RELEASE_CHECK,
    cordovaRunner: cordovaRunner,
    onBuilt: function () {
      // Opens a browser window when it finishes building
      if (options.open) {
        console.log("=> Opening your app in a browser...");
        if (process.env.ROOT_URL) {
          open(process.env.ROOT_URL)
        } else {
          open(`http://localhost:${options.port}`)
        }
      }
    }
  });
}

///////////////////////////////////////////////////////////////////////////////
// debug
///////////////////////////////////////////////////////////////////////////////

main.registerCommand(Object.assign(
  { name: 'debug' },
  runCommandOptions
), function (options) {
  options["inspect-brk"] = options["inspect-brk"] || "9229";
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
}, async function (options) {
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
    require('../shell-client').connect(
      files.convertToOSPath(projectContext.getMeteorShellDirectory())
    );

    throw new main.WaitForExit;
  }
});

///////////////////////////////////////////////////////////////////////////////
// create
///////////////////////////////////////////////////////////////////////////////

/**
 * list of all the available skeletons similar to the property below
 * {
 * clock: { repo: 'https://github.com/meteor/clock' },
 * leaderboard: { repo: 'https://github.com/meteor/leaderboard' },
 * }
 * @typedef {Object.<string, {repo: string}>} Skeletons
 */
/**
 * Resolves into json with
 * @returns {Promise<[Skeletons, null]> | Promise<[null, Error]>}
 */
function getExamplesJSON(){
  return tryRun(async () => {
    const response = await httpHelpers.request({
      url: "https://cdn.meteor.com/static/meteor.json",
      method: "GET",
      useSessionHeader: true,
      useAuthHeader: true,
    });
    return JSON.parse(response.body);
  });
}

const DEFAULT_SKELETON = "react";
export const AVAILABLE_SKELETONS = [
  "apollo",
  "bare",
  "blaze",
  "full",
  "minimal",
  DEFAULT_SKELETON,
  "typescript",
  "vue",
  "svelte",
  "tailwind",
  "chakra-ui",
  "solid",
];

const SKELETON_INFO = {
  "apollo": "To create a basic Apollo + React app",
  "bare": "To create an empty app",
  "blaze": "To create an app using Blaze",
  "full": "To create a more complete scaffolded app",
  "minimal": "To create an app with as few Meteor packages as possible",
  "react": "To create a basic React-based app",
  "typescript": "To create an app using TypeScript and React",
  "vue": "To create a basic Vue3-based app",
  "svelte": "To create a basic Svelte app",
  "tailwind": "To create an app using React and Tailwind",
  "chakra-ui": "To create an app Chakra UI and React",
  "solid": "To create a basic Solid app"
}

main.registerCommand({
  name: 'create',
  maxArgs: 1,
  minArgs: 0,
  options: {
    list: { type: Boolean },
    example: { type: String },
    package: { type: Boolean },
    bare: { type: Boolean },
    minimal: { type: Boolean },
    full: { type: Boolean },
    blaze: { type: Boolean },
    react: { type: Boolean },
    vue: { type: Boolean },
    typescript: { type: Boolean },
    apollo: { type: Boolean },
    svelte: { type: Boolean },
    tailwind: { type: Boolean },
    'chakra-ui': { type: Boolean },
    solid: { type: Boolean },
    prototype: { type: Boolean },
    from: { type: String },
  },
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  // Creating a package is much easier than creating an app, so if that's what
  // we are doing, do that first. (For example, we don't springboard to the
  // latest release to create a package if we are inside an app)
  if (options.package) {
    var packageName = options.args[0];
    if (options.prototype) {
      Console.error(
        `The ${Console.command(
          "--prototype"
        )} option is no longer supported for packages.`
      );
      Console.error();
      throw new main.ShowUsage();
    }
    if (options.list || options.example) {
      Console.error("No package examples exist at this time.");
      Console.error();
      throw new main.ShowUsage();
    }

    if (!packageName) {
      Console.error("Please specify the name of the package.");
      throw new main.ShowUsage();
    }

    utils.validatePackageNameOrExit(packageName, {
      detailedColonExplanation: true,
    });

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
        Console.error(
          packageName + ": Package names may not have more than one colon."
        );
        return 1;
      }

      fsName = split[1];
    }

    var packageDir;
    if (options.appDir) {
      packageDir = files.pathResolve(options.appDir, "packages", fsName);
    } else {
      packageDir = files.pathResolve(fsName);
    }

    var inYourApp = options.appDir ? " in your app" : "";

    if (files.exists(packageDir)) {
      Console.error(packageName + ": Already exists" + inYourApp);
      return 1;
    }

    var transform = async function (x) {
      var xn = x.replace(/~name~/g, packageName).replace(/~fs-name~/g, fsName);

      // If we are running from checkout, comment out the line sourcing packages
      // from a release, with the latest release filled in (in case they do want
      // to publish later). If we are NOT running from checkout, fill it out
      // with the current release.
      var relString;
      if (release.current.isCheckout()) {
        xn = xn.replace(/~cc~/g, "//");
        var rel = await catalog.official.getDefaultReleaseVersion();
        // the no-release case should never happen except in tests.
        relString = rel ? rel.version : "no-release";
      } else {
        xn = xn.replace(/~cc~/g, "");
        relString = release.current.getDisplayName({ noPrefix: true });
      }

      // If we are not in checkout, write the current release here.
      return xn.replace(/~release~/g, relString);
    };

    try {
      await files.cp_r(
        files.pathJoin(__dirnameConverted, "..", "static-assets", "skel-pack"),
        packageDir,
        {
          transformFilename: function (f) {
            return transform(f);
          },
          transformContents: async function (contents, f) {
            if (/(\.html|\.[jt]sx?|\.css)/.test(f)) {
              return Buffer.from(await transform(contents.toString()));
            } else {
              return contents;
            }
          },
          ignore: [/^local$/],
          preserveSymlinks: true,
        }
      );
    } catch (err) {
      Console.error("Could not create package: " + err.message);
      return 1;
    }

    var displayPackageDir = files.convertToOSPath(
      files.pathRelative(files.cwd(), packageDir)
    );

    // Since the directory can't have colons, the directory name will often not
    // match the name of the package exactly, therefore we should tell people
    // where it was created.
    Console.info(packageName + ": created in", Console.path(displayPackageDir));

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
  if (!release.current.isCheckout() && !release.forced) {
    if (release.current.name !== (await release.latestKnown())) {
      throw new main.SpringboardToLatestRelease();
    }
  }

  if (options.list) {
    Console.info("Available examples:");
    const [json, err] = await getExamplesJSON()
    if (err) {
      Console.error("Failed to fetch examples:", err.message);
      Console.info("Using cached examples.json");
    }
    const examples = err ? EXAMPLE_REPOSITORIES : json;
    _.each(examples, function (repoInfo, name) {
      const branchInfo = repoInfo.branch ? `/tree/${repoInfo.branch}` : "";
      Console.info(
        Console.command(`${name}: ${repoInfo.repo}${branchInfo}`),
        Console.options({ indent: 2 })
      );
    });

    Console.info();
    Console.info(
      "To create an example, simply",
      Console.command("'meteor create <app-name> --example <name>'")
    );
    return 0;
  }

  /**
   *
   * @returns {{appPathAsEntered: string, skeleton: string }}
   */
  const setup = async () => {
    // meteor create app-name
    if (options.args.length === 1) {
      const appPathAsEntered = options.args[0];
      const skeletonExplicitOption =
        AVAILABLE_SKELETONS.find(skeleton => !!options[skeleton]);

      const skeleton = skeletonExplicitOption || DEFAULT_SKELETON;

      console.log(`Using ${green`${skeleton}`} skeleton`);
      return {
        appPathAsEntered,
        skeleton
      }
    }
    function capitalizeFirstLetter(string) {
      return string.charAt(0).toUpperCase() + string.slice(1);
    }
    const prompt = inquirer.createPromptModule();
    // meteor create
    // need to ask app name and skeleton
    const r = await prompt([
      {
        type: 'input',
        name: 'appPathAsEntered',
        message: `What is the name/path of your ${yellow`app`}? `,
        default(){
          return 'my-app';
        }
      },
      {
        type: 'list',
        name: 'skeleton',
        message: `Which ${yellow`skeleton`} do you want to use?`,
        choices: AVAILABLE_SKELETONS.map(skeleton => {return `${capitalizeFirstLetter(skeleton)} # ${SKELETON_INFO[skeleton]}`}),
        default(){
          return `${capitalizeFirstLetter(DEFAULT_SKELETON)} # ${SKELETON_INFO[DEFAULT_SKELETON]}`;
        },
        filter(val) {
          const skel = val.split(' ')[0];
          console.log(`Using ${green`${skel}`} skeleton`);
          return skel.toLowerCase();
        }
      }
    ])
    return r;
  }

  var {
    appPathAsEntered,
    skeleton
  } = await setup();
  Console.setPretty(true) // to not lose the console

  var appPath = files.pathResolve(appPathAsEntered);

  if (files.findAppDir(appPath)) {
    Console.error(
      "You can't create a Meteor project inside another Meteor project."
    );
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
  var nonCodeFileExts = [".txt", ".md", ".json", ".sh"];

  var destinationHasCodeFiles = false;

  // If the directory doesn't exist, it clearly doesn't have any source code
  // inside itself
  if (files.exists(appPath)) {
    destinationHasCodeFiles = _.any(
      files.readdir(appPath),
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
        // we should try to create an app.
        var stats = files.stat(files.pathJoin(appPath, filePath));
        if (stats.isDirectory()) {
          // Could contain code
          return true;
        }

        // Check against our file extension white list
        var ext = files.pathExtname(filePath);
        if (ext == "" || nonCodeFileExts.includes(ext)) {
          return false;
        }

        // Everything not matched above is considered to be possible source code
        return true;
      }
    );
  }
  function cmd(text) {
    Console.info(
      Console.command(text),
      Console.options({
        indent: 2,
      })
    );
  }
  // Setup fn, which is called after the app is created, to print a message
  // about how to run the app.
  async function setupMessages() {
    // We are actually working with a new meteor project at this point, so
    // set up its context.
    var projectContext = new projectContextModule.ProjectContext({
      projectDir: appPath,
      // Write .meteor/versions even if --release is specified.
      alwaysWritePackageMap: true,
      // examples come with a .meteor/versions file, but we shouldn't take it
      // too seriously
      allowIncompatibleUpdate: true,
    });
    await main.captureAndExit(
      "=> Errors while creating your project",
      async function () {
        await projectContext.readProjectMetadata();
        if (buildmessage.jobHasMessages()) {
          return;
        }

        await projectContext.releaseFile.write(
          release.current.isCheckout() ? "none" : release.current.name
        );
        if (buildmessage.jobHasMessages()) {
          return;
        }

        // Also, write package version constraints from the current release
        // If we are on a checkout, we don't need to do this as running from
        // checkout still pins all package versions and if the user updates
        // to a real release, the packages file will subsequently get updated
        if (!release.current.isCheckout()) {
          projectContext.projectConstraintsFile.updateReleaseConstraints(
            release.current._manifest
          );
        }

        // Any upgrader that is in this version of Meteor doesn't need to be run on
        // this project.
        var upgraders = require("../upgraders.js");
        projectContext.finishedUpgraders.appendUpgraders(
          upgraders.allUpgraders()
        );

        await projectContext.prepareProjectForBuild();
      }
    );
    // No need to display the PackageMapDelta here, since it would include all of
    // the packages (or maybe an unpredictable subset based on what happens to be
    // in the template's versions file).

    // Since some of the project skeletons include npm `devDependencies`, we need
    // to make sure they're included when running `npm install`.
    await require("./default-npm-deps.js").install(appPath, {
      includeDevDependencies: true,
    });

    var appNameToDisplay =
      appPathAsEntered === "." ? "current directory" : `'${appPathAsEntered}'`;

    var message = `Created a new Meteor app in ${appNameToDisplay}`;

    message += ".";

    Console.info(message + "\n");

    // Print a nice message telling people we created their new app, and what to
    // do next.
    Console.info("To run your new app:");



    if (appPathAsEntered !== ".") {
      // Wrap the app path in quotes if it contains spaces
      const appPathWithQuotesIfSpaces =
        appPathAsEntered.indexOf(" ") === -1
          ? appPathAsEntered
          : `'${appPathAsEntered}'`;

      // Don't tell people to 'cd .'
      cmd("cd " + appPathWithQuotesIfSpaces);
    }

    cmd("meteor");

    Console.info("");
    Console.info(
      "If you are new to Meteor, try some of the learning resources here:"
    );
    Console.info(
      Console.url("https://www.meteor.com/tutorials"),
      Console.options({ indent: 2 })
    );

    Console.info("");
    Console.info(
      "When you’re ready to deploy and host your new Meteor application, check out Cloud:"
    );
    Console.info(
      Console.url("https://www.meteor.com/cloud"),
      Console.options({ indent: 2 })
    );

  }

  /**
   *
   * @param {string} url
   */
  const setupExampleByURL = async (url) => {
    const [ok, err] = await bash`git -v`;
    if (err) throw new Error("git is not installed");
    // Set GIT_TERMINAL_PROMPT=0 to disable prompting
    const [okClone, errClone] =
      await bash`GIT_TERMINAL_PROMPT=0 git clone --progress ${url} ${appPath}`;
    if (errClone && !errClone.includes("Cloning into")) {
      throw new Error("error cloning skeleton");
    }
    // remove .git folder from the example
    await files.rm_recursive_async(files.pathJoin(appPath, ".git"));
    await setupMessages();
  };

  if (options.example) {
    const [json, err] = await getExamplesJSON();

    if (err) {
      Console.error("Failed to fetch examples:", err.message);
      Console.info("Using cached examples.json");
    }

    const examples = err ? EXAMPLE_REPOSITORIES : json;
    const repoInfo = examples[options.example];
    if (!repoInfo) {
      Console.error(`${options.example}: no such example.`);
      Console.error(
        "List available applications with",
        Console.command("'meteor create --list'") + "."
      );
      return 1;
    }
    // repoInfo.repo is the URL of the repo, and repoInfo.branch is the branch
    await setupExampleByURL(repoInfo.repo);
    return 0;
  }


  if (options.from) {
    await setupExampleByURL(options.from);
    return 0;
  }

  var toIgnore = [/^local$/, /^\.id$/];
  if (destinationHasCodeFiles) {
    // If there is already source code in the directory, don't copy our
    // skeleton app code over it. Just create the .meteor folder and metadata
    toIgnore.push(/(\.html|\.js|\.css)/);
  }

  try {
    // Prototype option should use local skeleton.
    // Maybe we should use a different skeleton for prototype
    if (options.prototype) throw new Error("Using prototype option");
    // if using the release option we should use the default skeleton
    // using it as it was before 2.x
    if (release.explicit) throw new Error("Using release option");

    await setupExampleByURL(`https://github.com/meteor/skel-${skeleton}`);
  } catch (e) {

    if (
      e.message !== "Using prototype option" &&
      e.message !== "Using release option"
    ) {
      // something has happened while creating the app using git clone
      Console.error(
        `Something has happened while creating your app using git clone.
         Will use cached version of skeletons.
         Error message: `,
        e.message
      );
    }

       // TODO: decide if this should stay here or not.
       await files.cp_r(
        files.pathJoin(
          __dirnameConverted,
          "..",
          "static-assets",
          `skel-${skeleton}`
        ),
        appPath,
        {
          transformFilename: function (f) {
            return transform(f);
          },
          transformContents: function (contents, f) {
            // check if this app is just for prototyping if it is then we need to add autopublish and insecure in the packages file
            if (/packages/.test(f)) {
              const prototypePackages = () =>
                "autopublish             # Publish all data to the clients (for prototyping)\n" +
                "insecure                # Allow all DB writes from clients (for prototyping)";

              // XXX: if there is the need to add more options maybe we should have a better abstraction for this if-else
              if (options.prototype) {
                return Buffer.from(
                  contents.toString().replace(/~prototype~/g, prototypePackages())
                );
              } else {
                return Buffer.from(contents.toString().replace(/~prototype~/g, ""));
              }
            }
            if (/(\.html|\.[jt]sx?|\.css)/.test(f)) {
              return Buffer.from(transform(contents.toString()));
            } else {
              return contents;
            }
          },
          ignore: toIgnore,
          preserveSymlinks: true,
        }
      );
      await setupMessages();
  }

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
    packageType: { type: String },
    directory: { type: Boolean },
    architecture: { type: String },
    "server-only": { type: Boolean },
    'mobile-settings': { type: String },
    server: { type: String },
    "cordova-server-port": { type: String },
    // Indicates whether these build is running headless, e.g. in a
    // continuous integration building environment, where visual niceties
    // like progress bars and spinners are unimportant.
    headless: { type: Boolean },
    verbose: { type: Boolean, short: "v" },
    'allow-incompatible-update': { type: Boolean },
    platforms: { type: String }
  },
  catalogRefresh: new catalog.Refresh.Never()
};

main.registerCommand({
  name: "build",
  ...buildCommands,
}, async function (options) {
  return await Profile.run(
    "meteor build",
    async () =>  await buildCommand(options)
  );
});

// Deprecated -- identical functionality to 'build' with one exception: it
// doesn't output a directory with all builds but rather only one tarball with
// server/client programs.
// XXX COMPAT WITH 0.9.1.1
main.registerCommand({
  name: "bundle",
  hidden: true,
  ...buildCommands,
}, async function (options) {
  Console.error(
    "This command has been deprecated in favor of " +
    Console.command("'meteor build'") + ", which allows you to " +
    "build for multiple platforms and outputs a directory instead of " +
    "a single tarball. See " + Console.command("'meteor help build'") + " " +
    "for more information.");
  Console.error();

  return await Profile.run(
    "meteor bundle",
    async () => await buildCommand({
      ...options,
      _bundleOnly: true,
    })
  );
});

var buildCommand = async function (options) {
  Console.setVerbose(!!options.verbose);
  if (options.headless) {
    // There's no point in spinning the spinner when we're running
    // automated builds.
    Console.setHeadless(true);
  }
  // XXX output, to stderr, the name of the file written to (for human
  // comfort, especially since we might change the name)

  // XXX name the root directory in the bundle based on the basename
  // of the file, not a constant 'bundle' (a bit obnoxious for
  // machines, but worth it for humans)

  // Error handling for options.architecture. See archinfo for more
  // information on what the architectures are, what they mean, et cetera.
  if (options.architecture &&
      !_.has(archinfo.VALID_ARCHITECTURES, options.architecture)) {
    showInvalidArchMsg(options.architecture);
    return 1;
  }
  var bundleArch = options.architecture || archinfo.host();

  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    serverArchitectures: _.uniq([bundleArch, archinfo.host()]),
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });

  await main.captureAndExit("=> Errors while initializing project:", function () {
    // TODO Fix the nested Profile.run warning here, without interfering
    // with METEOR_PROFILE output for other commands, like `meteor run`.
    return projectContext.prepareProjectForBuild();
  });
  projectContext.packageMapDelta.displayOnConsole();

  // _bundleOnly implies serverOnly
  const serverOnly = options._bundleOnly || !!options['server-only'];

  // options['mobile-settings'] is used to set the initial value of
  // `Meteor.settings` on mobile apps. Pass it on to options.settings,
  // which is used in this command.
  if (options['mobile-settings']) {
    options.settings = options['mobile-settings'];
  }

  const appName = files.pathBasename(options.appDir);
  let parsedCordovaServerPort;
  let selectedPlatforms = null;
  if (options.platforms) {
    const platformsArray = options.platforms.split(",");

    platformsArray.forEach(plat => {
      if (![...excludableWebArchs, 'android', 'ios'].includes(plat)) {
        throw new Error(`Not allowed platform on '--platforms' flag: ${plat}`)
      }
    })

    selectedPlatforms = platformsArray;
  }

  let cordovaPlatforms;
  let parsedMobileServerUrl;
  if (!serverOnly) {
    cordovaPlatforms = projectContext.platformList.getCordovaPlatforms();

    if (selectedPlatforms) {
      cordovaPlatforms = _.intersection(selectedPlatforms, cordovaPlatforms)
    }

    if (process.platform !== 'darwin' && cordovaPlatforms.includes('ios')) {
      cordovaPlatforms = _.without(cordovaPlatforms, 'ios');
      Console.warn("Currently, it is only possible to build iOS apps \
on an OS X system.");
    }

    if (!_.isEmpty(cordovaPlatforms)) {
      const mobileServerOption = options.server;
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
      parsedCordovaServerPort = parseCordovaServerPortOption(options);
    }
  } else {
    cordovaPlatforms = [];
  }

  // If we specified some platforms, we need to build what was specified.
  // For example, if we want to build only android, there is no need to build
  // web.browser.
  let webArchs;
  if (selectedPlatforms) {
    const filteredArchs = projectContext.platformList
      .getWebArchs()
      .filter(arch => selectedPlatforms.includes(arch));

    if (
      !_.isEmpty(cordovaPlatforms) &&
      !filteredArchs.includes('web.cordova')
    ) {
      filteredArchs.push('web.cordova');
    }

    webArchs = filteredArchs.length ? filteredArchs : undefined;
  }

  var buildDir = projectContext.getProjectLocalDirectory('build_tar');
  var outputPath = files.pathResolve(options.args[0]); // get absolute path

  // Warn if people try to build inside the app directory.
  var relative = files.pathRelative(options.appDir, outputPath);
  // We would like the output path to be outside the app directory, which
  // means the first step to getting there is going up a level.
  if (relative.substr(0, 2) !== '..') {
    Console.warn();
    Console.labelWarn(`The output directory is under your source tree.
Your generated files may get interpreted as source code!
Consider building into a different directory instead
${Console.command("meteor build ../output")}`,
      Console.options({ indent: 2 }));
    Console.warn();
  }

  var bundlePath = options.directory ?
      (options._bundleOnly ? outputPath :
      files.pathJoin(outputPath, 'bundle')) :
      files.pathJoin(buildDir, 'bundle');

  await stats.recordPackages({
    what: "sdk.bundle",
    projectContext: projectContext
  });

  var bundler = require('../isobuild/bundler.js');
  var bundleResult = await bundler.bundle({
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
      webArchs,
    },
  });
  if (bundleResult.errors) {
    Console.error("Errors prevented bundling:");
    Console.error(bundleResult.errors.formatMessages());
    return 1;
  }

  if (!options._bundleOnly) {
    files.mkdir_p(outputPath);
  }

  if (!options.directory) {
    await main.captureAndExit('', 'creating server tarball', async () => {
      try {
        var outputTar = options._bundleOnly ? outputPath :
          files.pathJoin(outputPath, appName + '.tar.gz');

        await files.createTarball(files.pathJoin(buildDir, 'bundle'), outputTar);
      } catch (err) {
        buildmessage.exception(err);
        await files.rm_recursive(buildDir);
      }
    });
  }

  if (!_.isEmpty(cordovaPlatforms)) {

    let cordovaProject;
    await main.captureAndExit('', async () => {

      import {
        pluginVersionsFromStarManifest,
        displayNameForPlatform,
      } from '../cordova/index.js';

      await ensureDevBundleDependencies();

      await buildmessage.enterJob({ title: "preparing Cordova project" }, async() => {
        import { CordovaProject } from '../cordova/project.js';

        cordovaProject = new CordovaProject(projectContext, {
          settingsFile: options.settings,
          mobileServerUrl: utils.formatUrl(parsedMobileServerUrl),
          cordovaServerPort: parsedCordovaServerPort });
        await cordovaProject.init();
        if (buildmessage.jobHasMessages()) return;

        const pluginVersions = pluginVersionsFromStarManifest(
          bundleResult.starManifest);

        await cordovaProject.prepareFromAppBundle(bundlePath, pluginVersions);
      });

      for (platform of cordovaPlatforms) {
        await buildmessage.enterJob(
          { title: `building Cordova app for \
${displayNameForPlatform(platform)}` }, async () => {
            let buildOptions = { release: !options.debug };

            const buildPath = files.pathJoin(
              projectContext.getProjectLocalDirectory('cordova-build'),
              'platforms', platform);
            const platformOutputPath = files.pathJoin(outputPath, platform);

            // Prepare the project once again to ensure that it is up to date
            // with current build options.  For example, --server=example.com
            // is utilized in the Cordova builder to write boilerplate HTML and
            // various config.xml settings (e.g. access policies)
            if (platform === 'ios') {
              await cordovaProject.prepareForPlatform(platform, buildOptions);
            } else if (platform === 'android') {
              await cordovaProject.buildForPlatform(platform, {...buildOptions, argv: ["--packageType", options.packageType || "bundle"]});
            }

            // Once prepared, copy the bundle to the final location.
            await files.cp_r(buildPath,
              files.pathJoin(platformOutputPath, 'project'));

            // Make some platform-specific adjustments to the resulting build.
            if (platform === 'ios') {
              files.writeFile(
                files.pathJoin(platformOutputPath, 'README'),
`This is an auto-generated XCode project for your iOS application.

Instructions for publishing your iOS app to App Store can be found at:
https://guide.meteor.com/cordova.html#submitting-ios
`, "utf8");
            } else if (platform === 'android') {
              const packageType = options.packageType || "bundle"
              const packageExtension = packageType === 'bundle' ? 'aab' : 'apk';
              const packageName = packageType === 'bundle' ? `app-release` : `app-release-unsigned`;
              const apkPath = files.pathJoin(buildPath, `app/build/outputs/${packageType}/${options.debug ? 'debug' : 'release'}`,
                options.debug ? `app-debug.${packageExtension}` : `${packageName}.${packageExtension}`);

              console.log(apkPath);
              if (files.exists(apkPath)) {
              files.copyFile(apkPath, files.pathJoin(platformOutputPath,
                options.debug ? `app-debug.${packageExtension}` : `${packageName}.${packageExtension}`));
              }

              files.writeFile(
                files.pathJoin(platformOutputPath, 'README'),
`This is an auto-generated Gradle project for your Android application.

Instructions for publishing your Android app to Play Store can be found at:
https://guide.meteor.com/cordova.html#submitting-android
`, "utf8");
            }
        });
      }
    });
  }

  await files.rm_recursive(buildDir);
};

///////////////////////////////////////////////////////////////////////////////
// lint
///////////////////////////////////////////////////////////////////////////////
main.registerCommand({
  name: 'lint',
  maxArgs: 0,
  requiresAppOrPackage: true,
  options: {
    'allow-incompatible-update': { type: Boolean },

    // This option has never done anything, but we are keeping it for
    // backwards compatibility since it existed for 7 years before adding
    // the correctly named option
    'allow-incompatible-updates': { type: Boolean }
  },
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  const { packageDir, appDir } = options;

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

    await main.captureAndExit("=> Errors while setting up package:",
      // Read metadata and initialize catalog.
      async () => await projectContext.initializeCatalog()
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


  await main.captureAndExit("=> Errors prevented the build:",  async () =>
    await projectContext.prepareProjectForBuild()
  );

  const bundler = await require('../isobuild/bundler.js');
  const bundle = await bundler.bundle({
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

  if (bundle.warnings && bundle.warnings.hasMessages()) {
    Console.warn(bundle.warnings.formatMessages());
    return 1;
  }
  console.log(green`=> Done linting.`);
  return 0;
});

///////////////////////////////////////////////////////////////////////////////
// mongo
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'mongo',
  maxArgs: 1,
  options: {
    url: { type: Boolean, short: 'U' },
    verbose: { type: Boolean, short: 'V' },
  },
  requiresApp: function (options) {
    return options.args.length === 0;
  },
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  var mongoUrl;
  var usedMeteorAccount = false;

  if (options.args.length === 0) {
    // localhost mode
    var findMongoPort =
      require('../runners/run-mongo.js').findMongoPort;
    var mongoPort = await findMongoPort(files.pathJoin(options.appDir, ".meteor", "local", "db"));

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

    mongoUrl = await deploy.temporaryMongoUrl(site);
    usedMeteorAccount = true;

    if (!mongoUrl) {
      // temporaryMongoUrl() will have printed an error message
      return 1;
    }
  }
  if (options.url) {
    console.log(`${yellow`$`} ${ purple`mongosh` } ${ blue(mongoUrl) }`);
  } else {
    if (usedMeteorAccount) {
      await auth.maybePrintRegistrationLink();
    }
    process.stdin.pause();
    var runMongo = require('../runners/run-mongo.js');
    await runMongo.runMongoShell(mongoUrl,
      (err) => {
        console.log(red`Some error occured while trying to run mongosh.`);
        console.log(yellow`Check bellow for some more info:`);
        console.log(`
     Since version v5.0.5 the mongo shell has been superseded by the mongosh
     below there is the url to use with mongosh
     ${yellow`$`} ${ purple`mongosh` } ${ blue(mongoUrl) }
     `)

        if (err.code === 'ENOENT') {
          console.log(red`The 'mongosh' command line tool was not found in your PATH.`);
          console.log(`Check https://www.mongodb.com/docs/mongodb-shell/`);
          process.exit(2);
          return;
        }

        if (options.verbose) {
          console.log("here is a more verbose error message:");
          console.log(yellow`=====================================`);
          console.log(err);
          console.log(yellow`=====================================`);
        }

        process.exit(1);
      });
    throw new main.WaitForExit();
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
  options: {
    db: { type: Boolean },
  },
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  if (options.args.length !== 0) {
    Console.error("'meteor reset' command only affects the local project cache.");
    Console.error();
    Console.error("To remove also the local database use");
    Console.error(
      Console.command("meteor reset --db"), Console.options({ indent: 2 }));
    Console.error();
    Console.error("To reset a deployed application use");
    Console.error(
      Console.command("meteor deploy --delete appname"), Console.options({ indent: 2 }));
    Console.error("followed by");
    Console.error(
      Console.command("meteor deploy appname"), Console.options({ indent: 2 }));
    return 1;
  }

  if (process.env.MONGO_URL) {
    Console.info("As a precaution, meteor reset only clears the local database that is " +
                 "provided by meteor run for development. The database specified with " +
                 "MONGO_URL will NOT be reset.");
  }

  if (options.db) {
    // XXX detect the case where Meteor is running the app, but
    // MONGO_URL was set, so we don't see a Mongo process
    var findMongoPort = require('../runners/run-mongo.js').findMongoPort;
    var isRunning = !! await findMongoPort(files.pathJoin(options.appDir, ".meteor", "local", "db"));
    if (isRunning) {
      Console.error("reset: Meteor is running.");
      Console.error();
      Console.error(
        "This command does not work while Meteor is running your application.",
        "Exit the running Meteor development server.");
      return 1;
    }

    await files.rm_recursive_async(
      files.pathJoin(options.appDir, '.meteor', 'local')
    );
    Console.info("Project reset.");
    return;
  }

  var allExceptDb = files.getPathsInDir(files.pathJoin('.meteor', 'local'), {
    cwd: options.appDir,
    maxDepth: 1,
  }).filter(function (path) {
    return !path.includes('.meteor/local/db');
  });

  var allRemovePromises = allExceptDb.map(_path => files.rm_recursive_async(
    files.pathJoin(options.appDir, _path)
  ));
  await Promise.all(allRemovePromises);
  Console.info("Project reset.");
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
    settings: { type: String, short: 's' },
    // No longer supported, but we still parse it out so that we can
    // print a custom error message.
    password: { type: String },
    // Override architecture to deploy whatever stuff we have locally, even if
    // it contains binary packages that should be incompatible. A hack to allow
    // people to deploy from checkout or do other weird shit. We are not
    // responsible for the consequences.
    'override-architecture-with-local' : { type: Boolean },
    'allow-incompatible-update': { type: Boolean },
    'deploy-polling-timeout': { type: Number },
    'no-wait': { type: Boolean },
    // Useful to cache the build between deploys, in some cases people deploy
    // the same build to different hostnames
    'cache-build': { type: Boolean },
    // Useful when you want to build first to have a cache-build and then deploy
    // many apps
    'build-only': { type: Boolean },
    free: { type: Boolean },
    plan: { type: String },
    'container-size': { type: String },
    'deploy-token': { type: String },
    mongo: { type: Boolean },
    owner: { type: String }
  },
  allowUnrecognizedOptions: true,
  requiresApp: function (options) {
    return ! options.delete;
  },
  catalogRefresh: new catalog.Refresh.Never()
}, async function (...args) {
  return await Profile.run(
    "meteor deploy",
    async () => await deployCommand(...args)
  );
});

async function deployCommand(options, { rawOptions }) {
  const site = options.args[0];

  if (options.delete) {
    return await deploy.deleteApp(site);
  }

  if (options.password) {
    Console.error(
      "Setting passwords on apps is no longer supported. Now there are " +
        "user accounts and your apps are associated with your account so " +
        "that only you (and people you designate) can access them. See the " +
        Console.command("'meteor authorized'") + " command.");
    return 1;
  }

  const loggedIn = auth.isLoggedIn();
  if (! loggedIn && !options["deploy-token"]) {
    Console.error(
      "You must be logged in to deploy, just enter your email address.");
    Console.error();
    const isRegistered = await auth.registerOrLogIn();
    if (! isRegistered) {
      return 1;
    }
  }

  // Override architecture iff applicable.
  let buildArch = DEPLOY_ARCH;
  if (options['override-architecture-with-local']) {
    Console.warn();
    Console.labelWarn(
      "OVERRIDING DEPLOY ARCHITECTURE WITH LOCAL ARCHITECTURE.",
      "If your app contains binary code, it may break in unexpected " +
      "and terrible ways.");
    buildArch =  archinfo.host();
  }

  const projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    serverArchitectures: _.uniq([buildArch,  archinfo.host()]),
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });
  await main.captureAndExit("=> Errors while initializing project:", function () {
    // TODO Fix nested Profile.run warning here, too.
    return projectContext.prepareProjectForBuild();
  });
  projectContext.packageMapDelta.displayOnConsole();

  const buildOptions = {
    minifyMode: options.debug ? 'development' : 'production',
    buildMode: options.debug ? 'development' : 'production',
    serverArch: buildArch
  };

  let deployPollingTimeoutMs = null;
  if (options['deploy-polling-timeout']) {
    deployPollingTimeoutMs = options['deploy-polling-timeout'];
  }
  let plan = null;
  if (options.plan) {
    plan = options.plan;
  }
  let containerSize = null;
  if (options['container-size']) {
    containerSize = options['container-size'];
  }

  const isCacheBuildEnabled = !!options['cache-build'];
  const isBuildOnly = !!options['build-only'];
  const waitForDeploy = !options['no-wait'];

  const deployResult = await deploy.bundleAndDeploy({
    projectContext,
    site,
    settingsFile: options.settings,
    free: options.free,
    deployToken: options['deploy-token'],
    owner: options.owner,
    mongo: options.mongo,
    buildOptions: buildOptions,
    plan,
    containerSize,
    rawOptions,
    deployPollingTimeoutMs,
    waitForDeploy,
    isCacheBuildEnabled,
    isBuildOnly,
  });

  if (deployResult === 0) {
    await auth.maybePrintRegistrationLink({
      leadingNewline: true,
      // If the user was already logged in at the beginning of the
      // deploy, then they've already been prompted to set a password
      // at least once before, so we use a slightly different message.
      firstTime: !loggedIn
    });
  }

  return deployResult;
}

///////////////////////////////////////////////////////////////////////////////
// authorized
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'authorized',
  minArgs: 1,
  maxArgs: 1,
  options: {
    add: { type: String, short: "a" },
    transfer: { type: String, short: "t" },
    remove: { type: String, short: "r" },
    list: { type: Boolean }
  },
  pretty: function (options) {
    // pretty if we're mutating; plain if we're listing (which is more likely to
    // be used by scripts)
    return options.add || options.remove || options.transfer;
  },
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {

  if (Object.keys(_.pick(options, 'add', 'remove', 'transfer', 'list')).length > 1) {
    Console.error(
      "Sorry, you can only perform one authorization operation at a time.");
    return 1;
  }

  await auth.pollForRegistrationCompletion();
  var site = qualifySitename(options.args[0]);

  if (! auth.isLoggedIn()) {
    Console.error(
      "You must be logged in for that. Try " +
      Console.command("'meteor login'"));
    return 1;
  }

  if (options.add) {
    return await deploy.changeAuthorized(site, "add", options.add);
  } else if (options.remove) {
    return await deploy.changeAuthorized(site, "remove", options.remove);
  } else if (options.transfer) {
    return await deploy.changeAuthorized(site, "transfer", options.transfer);
  } else {
    return await deploy.listAuthorized(site);
  }
});

///////////////////////////////////////////////////////////////////////////////
// test and test-packages
///////////////////////////////////////////////////////////////////////////////

testCommandOptions = {
  maxArgs: Infinity,
  catalogRefresh: new catalog.Refresh.Never(),
  options: {
    port: { type: String, short: "p", default: DEFAULT_PORT },
    open: { type: Boolean, short: "o", default: false },
    'mobile-server': { type: String },
    'cordova-server-port': { type: String },
    'debug-port': { type: String },
    ...inspectOptions,
    'no-release-check': { type: Boolean },
    deploy: { type: String },
    production: { type: Boolean },
    settings: { type: String, short: 's' },
    // Indicates whether these self-tests are running headless, e.g. in a
    // continuous integration testing environment, where visual niceties
    // like progress bars and spinners are unimportant.
    headless: { type: Boolean },
    verbose: { type: Boolean, short: "v" },
    'raw-logs': { type: Boolean },

    // Undocumented. See #Once
    once: { type: Boolean },
    // Undocumented. To ensure that QA covers both
    // PollingObserveDriver and OplogObserveDriver, this option
    // disables oplog for tests.  (It still creates a replset, it just
    // doesn't do oplog tailing.)
    'disable-oplog': { type: Boolean },
    // Undocumented flag to use a different test driver.
    'driver-package': { type: String },

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
    'exclude': { type: String },

    // one of the following must be true
    'test': { type: Boolean, 'default': false },
    'test-packages': { type: Boolean, 'default': false },

    // For 'test-packages': Run in "full app" mode
    'full-app': { type: Boolean, 'default': false },

    'extra-packages': { type: String },

    'exclude-archs': { type: String }
  }
};

main.registerCommand(Object.assign({
  name: 'test',
  requiresApp: true
}, testCommandOptions), function (options) {
  options['test'] = true;
  return doTestCommand(options);
});

main.registerCommand(Object.assign(
  { name: 'test-packages' },
  testCommandOptions
), function (options) {
  options['test-packages'] = true;
  return doTestCommand(options);
});

async function doTestCommand(options) {
  // This "metadata" is accessed in a few places. Using a global
  // variable here was more expedient than navigating the many layers
  // of abstraction across the build process.
  //
  // As long as the Meteor CLI runs a single command as part of each
  // process, this should be safe.
  global.testCommandMetadata = {};

  Console.setVerbose(!!options.verbose);
  if (options.headless) {
    Console.setHeadless(true);
  }

  const runTargets = parseRunTargets(_.intersection(
    Object.keys(options), ['ios', 'ios-device', 'android', 'android-device']));

  const { parsedServerUrl, parsedMobileServerUrl, parsedCordovaServerPort } =
    parseServerOptionsForRunCommand(options, runTargets);

  // Make a temporary app dir (based on the test runner app). This will be
  // cleaned up on process exit. Using a temporary app dir means that we can
  // run multiple "test-packages" commands in parallel without them stomping
  // on each other.
  let testRunnerAppDir;
  const testAppPath = options['test-app-path'];
  if (testAppPath) {
    const absTestAppPath = files.pathResolve(testAppPath);
    try {
      if (files.mkdir_p(absTestAppPath, 0o700)) {
        testRunnerAppDir = absTestAppPath;
      } else {
        Console.error(
          'The specified --test-app-path directory could not be used, as ' +
          `"${testAppPath}" already exists and it is not a directory.`
        );
        return 1;
      }
    } catch (error) {
      Console.error(
        'Unable to create the specified --test-app-path directory of ' +
        `"${testAppPath}".`
      );
      throw error;
    }
  }

  if (!testRunnerAppDir) {
    testRunnerAppDir = files.mkdtemp('meteor-test-run');
  }

  // Download packages for our architecture, and for the deploy server's
  // architecture if we're deploying.
  const archInfoHost = archinfo.host();
  var serverArchitectures = [archInfoHost];
  if (options.deploy && DEPLOY_ARCH !== archInfoHost) {
    serverArchitectures.push(DEPLOY_ARCH);
  }

  if (options['raw-logs']) {
    runLog.setRawLogs(true);
  }

  var includePackages = [];
  if (options['extra-packages']) {
    includePackages = options['extra-packages'].trim().split(/\s*,\s*/);
  }

  if (options['driver-package']) {
    includePackages.push(
      global.testCommandMetadata.driverPackage =
        options['driver-package'].trim()
    );
  } else if (options["test-packages"]) {
    includePackages.push(
      global.testCommandMetadata.driverPackage = "test-in-browser"
    );
  }

  var projectContextOptions = {
    serverArchitectures: serverArchitectures,
    allowIncompatibleUpdate: options['allow-incompatible-update'],
    lintAppAndLocalPackages: !options['no-lint'],
    includePackages: includePackages
  };
  var projectContext;

  if (options["test-packages"]) {
    projectContextOptions.projectDir = testRunnerAppDir;
    projectContextOptions.projectDirForLocalPackages = options.appDir;

    try {
      const { install } = require("./default-npm-deps.js");
      await install(testRunnerAppDir);
    } catch (error) {
      if (error.code === 'EACCES' && options['test-app-path']) {
        Console.error(
          'The specified --test-app-path directory of ' +
          `"${testRunnerAppDir}" exists, but the current user does not have ` +
          `read/write permission in it.`
        );
      }
      throw error;
    }

    if (buildmessage.jobHasMessages()) {
      return;
    }

    // Find any packages mentioned by a path instead of a package name. We will
    // load them explicitly into the catalog.
    var packagesByPath = _.filter(options.args, function (p) {
      return p.indexOf('/') !== -1;
    });
    // If we're currently in an app, we still want to use the real app's
    // packages subdirectory, not the test runner app's empty one.
    projectContextOptions.explicitlyAddedLocalPackageDirs = packagesByPath;

    // XXX Because every run uses a new app with its own IsopackCache directory,
    //     this always does a clean build of all packages. Maybe we can speed up
    //     repeated test-packages calls with some sort of shared or semi-shared
    //     isopack cache that's specific to test-packages?  See #3012.
    projectContext = new projectContextModule.ProjectContext(projectContextOptions);

    await main.captureAndExit("=> Errors while initializing project:", function () {
      // We're just reading metadata here --- we'll wait to do the full build
      // preparation until after we've started listening on the proxy, etc.
      return projectContext.readProjectMetadata();
    });

    await main.captureAndExit("=> Errors while setting up tests:", function () {
      // Read metadata and initialize catalog.
      return projectContext.initializeCatalog();
    });

    // Overwrite .meteor/release.
    await projectContext.releaseFile.write(
      release.current.isCheckout() ? "none" : release.current.name);

    var packagesToAdd = await getTestPackageNames(projectContext, options.args);

    // filter out excluded packages
    var excludedPackages = options.exclude && options.exclude.split(',');
    if (excludedPackages) {
      packagesToAdd = _.filter(packagesToAdd, function (p) {
        return ! _.some(excludedPackages, function (excluded) {
          return p.replace(/^local-test:/, '') === excluded;
        });
      });
    }

    // Use the driver package if running `meteor test-packages`. For
    // `meteor test`, the driver package is expected to already
    // have been added to the app.
    packagesToAdd.unshift(global.testCommandMetadata.driverPackage);

    // Also, add `autoupdate` so that you don't have to manually refresh the tests
    packagesToAdd.unshift("autoupdate");

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
    await projectContext.projectConstraintsFile.writeIfModified();
  } else if (options["test"]) {
    if (!options['driver-package']) {
      throw new Error("You must specify a driver package with --driver-package");
    }

    global.testCommandMetadata.driverPackage = options['driver-package'];

    global.testCommandMetadata.isAppTest = options['full-app'];
    global.testCommandMetadata.isTest = !global.testCommandMetadata.isAppTest;

    projectContextOptions.projectDir = options.appDir;
    projectContextOptions.projectLocalDir = files.pathJoin(testRunnerAppDir, '.meteor', 'local');

    // Copy the existing build and isopacks to speed up the initial start
    async function copyDirIntoTestRunnerApp(allowSymlink, ...parts) {
      // Depending on whether the user has run `meteor run` or other commands, they
      // may or may not exist yet
      const appDirPath = files.pathJoin(options.appDir, ...parts);
      const testDirPath = files.pathJoin(testRunnerAppDir, ...parts);

      files.mkdir_p(appDirPath);
      files.mkdir_p(files.pathDirname(testDirPath));

      if (allowSymlink) {
        // Windows can create junction links without administrator
        // privileges since both paths refer to directories.
        files.symlink(appDirPath, testDirPath, "junction");
      } else {
        await files.cp_r(appDirPath, testDirPath, {
          preserveSymlinks: true
        });
      }
    }

    await copyDirIntoTestRunnerApp(false, '.meteor', 'local', 'build');
    await copyDirIntoTestRunnerApp(true, '.meteor', 'local', 'bundler-cache');
    await copyDirIntoTestRunnerApp(true, '.meteor', 'local', 'isopacks');
    await copyDirIntoTestRunnerApp(true, '.meteor', 'local', 'plugin-cache');
    await copyDirIntoTestRunnerApp(true, '.meteor', 'local', 'shell');

    projectContext = new projectContextModule.ProjectContext(projectContextOptions);

    await main.captureAndExit("=> Errors while setting up tests:", async function () {
      // Read metadata and initialize catalog.
      return await projectContext.initializeCatalog();
    });
  } else {
    throw new Error("Unexpected: neither test-packages nor test");
  }

  // The rest of the projectContext preparation process will happen inside the
  // runner, once the proxy is listening. The changes we made were persisted to
  // disk, so projectContext.reset won't make us forget anything.

  let cordovaRunner;

  // TODO [FIBERS] -> Check cordova
  if (!_.isEmpty(runTargets)) {
    function prepareCordovaProject() {
      return main.captureAndExit('', 'preparing Cordova project', async () => {
        import { CordovaProject } from '../cordova/project.js';

        const cordovaProject = new CordovaProject(projectContext, {
          settingsFile: options.settings,
          mobileServerUrl: utils.formatUrl(parsedMobileServerUrl),
          cordovaServerPort: parsedCordovaServerPort });
        await cordovaProject.init();

        if (buildmessage.jobHasMessages()) return;

        cordovaRunner = new CordovaRunner(cordovaProject, runTargets);
        await projectContext.platformList.write(cordovaRunner.platformsForRunTargets);
        await cordovaRunner.checkPlatformsForRunTargets();
      });
    }

    await ensureDevBundleDependencies();
    await prepareCordovaProject();
  }

  options.cordovaRunner = cordovaRunner;

  return await runTestAppForPackages(projectContext, Object.assign(
    options,
    {
      mobileServerUrl: utils.formatUrl(parsedMobileServerUrl),
      cordovaServerPort: parsedCordovaServerPort,
      proxyPort: parsedServerUrl.port,
      proxyHost: parsedServerUrl.hostname,
    }
  ));
}

// Returns the "local-test:*" package names for the given package names (or for
// all local packages if packageNames is empty/unspecified).
var getTestPackageNames = async function (projectContext, packageNames) {
  var packageNamesSpecifiedExplicitly = ! _.isEmpty(packageNames);
  if (_.isEmpty(packageNames)) {
    // If none specified, test all local packages. (We don't have tests for
    // non-local packages.)
    packageNames = await projectContext.localCatalog.getAllPackageNames();
  }
  var testPackages = [];
  await main.captureAndExit("=> Errors while collecting tests:", async function () {
    for (const p of packageNames) {
      await buildmessage.enterJob("trying to test package `" + p + "`", async function () {
        // If it's a package name, look it up the normal way.
        if (p.indexOf('/') === -1) {
          if (p.indexOf('@') !== -1) {
            buildmessage.error(
                "You may not specify versions for local packages: " + p );
            return;  // recover by ignoring
          }
          // Check to see if this is a real local package, and if it is a real
          // local package, if it has tests.
          var version = await projectContext.localCatalog.getLatestVersion(p);
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
            buildmessage.error("Package not found in local catalog");
            return;
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
    }
  });

  return testPackages;
};

var runTestAppForPackages = async function (projectContext, options) {
  var buildOptions = {
    minifyMode: options.production ? 'production' : 'development'
  };
  buildOptions.buildMode = "test";
  let webArchs = projectContext.platformList.getWebArchs();
  if (options.cordovaRunner) {
    webArchs.push("web.cordova");
  }
  buildOptions.webArchs = filterWebArchs(webArchs, options['exclude-archs']);

  if (options.deploy) {
    // Run the constraint solver and build local packages.
    await main.captureAndExit("=> Errors while initializing project:", function () {
      return projectContext.prepareProjectForBuild();
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
      proxyPort: options.proxyPort,
      proxyHost: options.proxyHost,
      ...normalizeInspectOptions(options),
      disableOplog: options['disable-oplog'],
      settingsFile: options.settings,
      testMetadata: global.testCommandMetadata,
      banner: options['show-test-app-path'] ? null : "Tests",
      buildOptions: buildOptions,
      rootUrl: process.env.ROOT_URL,
      mongoUrl: process.env.MONGO_URL,
      oplogUrl: process.env.MONGO_OPLOG_URL,
      mobileServerUrl: options.mobileServerUrl,
      once: options.once,
      noReleaseCheck: options['no-release-check'] || process.env.METEOR_NO_RELEASE_CHECK,
      recordPackageUsage: false,
      selenium: options.selenium,
      seleniumBrowser: options['selenium-browser'],
      cordovaRunner: options.cordovaRunner,
      // On the first run, we shouldn't display the delta between "no packages
      // in the temp app" and "all the packages we're testing". If we make
      // changes and reload, though, it's fine to display them.
      omitPackageMapDeltaDisplayOnFirstRun: true,
      onBuilt: function () {
        // Opens a browser window when it finishes building
        if (options.open) {
          console.log("=> Opening your app in a browser...");
          if (process.env.ROOT_URL) {
            open(process.env.ROOT_URL)
          } else {
            open(`http://localhost:${options.port}`)
          }
        }
      }
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
},  function (options) {
  return auth.loginCommand(Object.assign({
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

var loggedInAccountsConnectionOrPrompt = async function (action) {
  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    Console.error("You must be logged in to " + action + ".");
    await auth.doUsernamePasswordLogin({ retry: true });
    Console.info();
  }

  token = auth.getSessionToken(config.getAccountsDomain());
  var conn = await auth.loggedInAccountsConnection(token);
  if (conn === null) {
    // Server rejected our token.
    Console.error("You must be logged in to " + action + ".");
    await auth.doUsernamePasswordLogin({ retry: true });
    Console.info();
    token = auth.getSessionToken(config.getAccountsDomain());
    conn = await auth.loggedInAccountsConnection(token);
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
}, async function (options) {

  var token = auth.getSessionToken(config.getAccountsDomain());
  if (! token) {
    Console.error("You must be logged in to list your organizations.");
    await auth.doUsernamePasswordLogin({ retry: true });
    Console.info();
  }

  var url = config.getAccountsApiUrl() + "/organizations";
  try {
    var result = await httpHelpers.request({
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
}, async function (options) {

  if (options.add && options.remove) {
    Console.error(
      "Sorry, you can only add or remove one member at a time.");
    throw new main.ShowUsage;
  }

  var username = options.add || options.remove;

  var conn = await loggedInAccountsConnectionOrPrompt(
    username ? "edit organizations" : "show an organization's members");

  if (username ) {
    // Adding or removing members
    try {
      await conn.callAsync(
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
      var result = await conn.callAsync("showOrganization", options.args[0]);
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
    phantom: { type: Boolean },
    // Indicates whether these self-tests are running headless, e.g. in a
    // continuous integration testing environment, where visual niceties
    // like progress bars and spinners are unimportant.
    headless: { type: Boolean },
    history: { type: Number },
    list: { type: Boolean },
    file: { type: String },
    exclude: { type: String },
    // Skip tests w/ this tag
    'without-tag': { type: String },
    // Only run tests with this tag
    'with-tag': { type: String },
    junit: { type: String },
    retries: { type: Number, default: 2 },
    // Skip tests, after filter
    skip: { type: Number },
    // Limit tests, after filter
    limit: { type: Number },
    // Don't run tests, just show the plan after filter, skip and limit
    preview: { type: Boolean },
  },
  hidden: true,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  if (! files.inCheckout()) {
    Console.error("self-test is only supported running from a checkout");
    return 1;
  }

  var selftest = require('../tool-testing/selftest.js');

  // Auto-detect whether to skip 'net' tests, unless --force-online is passed.
  var offline = false;
  if (!options['force-online']) {
    try {
      await require('../utils/http-helpers.js').getUrl("http://www.google.com/");
    } catch (e) {
      if (e instanceof files.OfflineError) {
        offline = true;
      }
    }
  }

  var compileRegexp = function (str) {
    try {
      return new RegExp(str);
    } catch (e) {
      if (!(e instanceof SyntaxError)) {
        throw e;
      }
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
    await selftest.listTests({
      onlyChanged: options.changed,
      offline: offline,
      includeSlowTests: options.slow,
      galaxyOnly: options.galaxy,
      testRegexp: testRegexp,
      fileRegexp: fileRegexp,
      'without-tag': options['without-tag'],
      'with-tag': options['with-tag']
    });

    return 0;
  }

  const clients = {
    puppeteer: true, // Puppeteer is always enabled.
    phantom: options.phantom,
    browserstack: options.browserstack,
  };

  if (options.headless) {
    // There's no point in spinning the spinner when we're running
    // continuous integration tests.
    Console.setHeadless(true);
  }

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
    retries: options.retries,
    historyLines: options.history,
    clients: clients,
    junit: options.junit && files.pathResolve(options.junit),
    'without-tag': options['without-tag'],
    'with-tag': options['with-tag'],
    skip: options.skip,
    limit: options.limit,
    preview: options.preview,
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
}, async function (options) {
  await auth.pollForRegistrationCompletion();
  if (! auth.isLoggedIn()) {
    Console.error(
      "You must be logged in for that. Try " +
      Console.command("'meteor login'") + ".");
    return 1;
  }

  return deploy.listSites();
});


///////////////////////////////////////////////////////////////////////////////
// generate
///////////////////////////////////////////////////////////////////////////////

/**
 *
 * @param question
 * @returns {function(string): Promise<string>}
 */
const createPrompt = () => {
  const readline = require('readline')
    .createInterface({ input: process.stdin, output: process.stdout });
  return async (question) => new Promise((resolve, reject) => {
    readline.question(question, (answer) => {
      resolve(answer);
    })
  })
}

const sanitizeBoolAnswer = (string) => {
  if (string === '') return true;

  if (string.toLowerCase() === 'y' || string.toLowerCase() === 'yes') return true;

  if (string.toLowerCase() === 'n' || string.toLowerCase() === 'no' ) return false;

  Console.error(red('You must provide a valid answer'));
  Console.error(yellow('it should be either (y)es or (n)o or just press enter to accept the default value'));
  throw new main.ExitWithCode(2);
}

/**
 * simple verification for the name
 * @param scaffoldName {string}
 */
const checkScaffoldName = (scaffoldName) => {
  if (scaffoldName === '') {
    Console.error(red('You must provide a name for your model.'));
    Console.error(yellow('Model names should not be empty.'));
    throw new main.ExitWithCode(2);
  }

  if (scaffoldName.includes('/')) {
    Console.error(red('You must provide a valid name for your model.'));
    Console.error(yellow('Model names should not contain slashes.'));
    throw new main.ExitWithCode(2);
  }

  const allNonWordRegex = /[^a-zA-Z0-9_-]/g; // all numbers and letters plus _ and -
  if (allNonWordRegex.test(scaffoldName)) {
    Console.error(red('You must provide a valid name for your model.'));
    Console.error(yellow('Model names should not contain special characters except _ and -'));
    throw new main.ExitWithCode(2);
  }
}

main.registerCommand({
  name: 'generate',
  maxArgs: 1,
  minArgs: 0,
  options: {
    path: { type: String },
    methods: { type: Boolean },
    publications: { type: Boolean },
    templatePath : { type: String },
    replaceFn : { type: String },
  },
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  const { args, appDir } = options;

  const setup = async (arg0) => {
    if (arg0 === undefined) {
      const ask = createPrompt();
      // the ANSI color chart is here: https://en.wikipedia.org/wiki/ANSI_escape_code#Colors
      const scaffoldName = await ask(`What is the name of your ${yellow`model`}? `);
      checkScaffoldName(scaffoldName);
      const areMethods = await ask(`There will be methods [${green`Y`}/${red`n`}]? press enter for ${green`yes`}  `);
      const methods = sanitizeBoolAnswer(areMethods);
      const arePublications = await ask(`There will be publications [${green`Y`}/${red`n`}]? press enter for ${green`yes`}  `);
      const publications = sanitizeBoolAnswer(arePublications);
      const path = await ask(`Where it will be placed? press enter for ${yellow`./imports/api/`} `);
      return {
        isWizard: true,
        scaffoldName,
        path,
        methods,
        publications,
      }
    }

    const {
      path,
      methods,
      publications
    } = options;

    return {
      isWizard: false,
      scaffoldName: arg0,
      path,
      methods,
      publications,
    }
  }
  /**
   * @type{string}
   */
  const {
    isWizard,
    scaffoldName,
    path,
    methods,
    publications
  } = await setup(args[0]);

  checkScaffoldName(scaffoldName);
  // get directory where we will place our files
  const scaffoldPath = path ||`${ appDir }/imports/api/${ scaffoldName }`;

  /**
   *
   * @param appDir
   * @returns {string[]}
   */
  const getFilesInDir = (appDir) => {
    const appPath = files.pathResolve(appDir);
    return files.readdir(appPath);
  }

  const getExtension = () => {
    const rootFiles = getFilesInDir(appDir);
    if (rootFiles.includes('tsconfig.json')) return 'ts'
    else return 'js'
  }

  /**
   *
   * @returns {string}
   */
  const userTransformFilenameFn = (filename) => {
    const path = files.pathResolve(files.pathJoin(appDir, options.replaceFn));
    const replaceFn = require(path).transformFilename;
    if (typeof replaceFn !== 'function') {
      Console.error(red`You must provide a valid function transformFilename.`);
      Console.error(yellow`The function should be named transformFilename and should be exported.`);
      throw new main.ExitWithCode(2);
    }
    return replaceFn(scaffoldName, filename);
  }
  /**
   *
   * @returns {string}
   */
  const userTransformContentsFn = (contents, fileName) => {
    const path = files.pathResolve(files.pathJoin(appDir, options.replaceFn));
    const replaceFn = require(path).transformContents;
    if (typeof replaceFn !== 'function') {
      Console.error(red`You must provide a valid function transformContents.`);
      Console.error(yellow`The function should be named transformContents and should be exported.`);
      throw new main.ExitWithCode(2);
    }
    return replaceFn(scaffoldName, contents, fileName);
  }

  /**
   * if contains - turns into pascal
   * @param str{string}
   * @returns {string}
   */
  const toPascalCase = (str) => {
    if(!str.includes('-')) return str.charAt(0).toUpperCase() + str.slice(1);
    else return str.split('-').map(toPascalCase).join('');
  }
  const toCamelCase = (str) => {
    if(!str.includes('-')) return str.charAt(0).toLowerCase() + str.slice(1);
    else return str.split('-').map(toPascalCase).join('');
  }

  /**
   *
   * @param name {string}
   */
  const transformName = (name) => {
    return name.replace(/\$\$name\$\$|\$\$PascalName\$\$|\$\$camelName\$\$/g, function (substring, args) {
      if (substring === '$$name$$') return scaffoldName;
      if (substring === '$$PascalName$$') return toPascalCase(scaffoldName);
      if (substring === '$$camelName$$') return toCamelCase(scaffoldName);
    })
  }

  /**
   *
   * @param content{string}
   * @param fileName{string}
   * @returns {string}
   */
  const removeUnusedLines = (content, fileName) => {
    if (methods && publications) return content;
    if (!methods && !publications) return content;
    if(!fileName.startsWith('index')) return content;
    return content
      .split('\n')
      .filter(line => {
        if (!methods && line.includes('methods')) return false;
        if (!publications && line.includes('publications')) return false;
        return true;
      })
      .join('\n');
  }
  /// Program
  const rootFiles = getFilesInDir(appDir);
  if (!rootFiles.includes('.meteor')) {
    Console.error(red`You must be in a Meteor project to run this command`);
    Console.error(yellow`You can create a new Meteor project with 'meteor create'`);
    throw new main.ExitWithCode(2);
  }

  const extension = getExtension()
  const assetsPath = () => {
    if (options.templatePath){
      const templatePath = files.pathJoin(appDir, options.templatePath)
      Console.info(`Using template that is in: ${purple(templatePath)}`)
      return templatePath;
    }
    return files.pathJoin(
      __dirnameConverted,
      '..',
      'static-assets',
      `scaffolds-${ extension }`)
  }
  // create directory
  const isOk = files.mkdir_p(scaffoldPath);
  if (!isOk) {
    Console.error(red`Something went wrong when creating the folder`);
    Console.error(yellow`Do you have the correct permissions?`);
    throw new main.ExitWithCode(2);
  }

  await files.cp_r(assetsPath(), files.pathResolve(scaffoldPath), {
    transformFilename: function (f) {
      if (options.replaceFn) return userTransformFilenameFn(f);
      return transformName(f);
    },
    transformContents: function (contents, fileName) {
      if (options.replaceFn) return userTransformContentsFn(contents.toString(), fileName);
      const cleaned = removeUnusedLines(contents.toString(), fileName);
      return transformName(cleaned);
    }
  })

  const checkAndRemoveFiles = () => {
    if (!methods)
      files.unlink(files.pathJoin(scaffoldPath, `methods.${ extension }`));

    if (!publications)
      files.unlink(files.pathJoin(scaffoldPath, `publications.${ extension }`));
  }

  const xor = (a, b) => ( a || b ) && !( a && b );

  if (!isWizard && xor(methods, publications)) {
    checkAndRemoveFiles()
  }

  if (isWizard) {
    checkAndRemoveFiles()
  }

  const packageJsonPath = files.pathJoin(appDir, 'package.json');
  const packageJsonFile = files.readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonFile);

  const mainJsPath =
    packageJson?.meteor?.mainModule?.server
      ? files.pathJoin(appDir, packageJson.meteor.mainModule.server)
      : files.pathJoin(appDir, 'server', 'main.js');
  const mainJs = files.readFile(mainJsPath);
  const mainJsLines = mainJs.toString().split('\n');
  const importLine = path
    ? `import '${path}';`
    : `import '/imports/api/${ scaffoldName }';`
  const mainJsFile = [importLine, ...mainJsLines].join('\n');
  files.writeFile(mainJsPath, mainJsFile);

  Console.info(`Created ${ blue(scaffoldName) } scaffold in ${ yellow(scaffoldPath) }`);

  return 0;
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
    // 15. (Meteor Software can reserve machines for longer than that.)
    minutes: { type: Number }
  },
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.warn();
  Console.warn("The 'meteor admin get-machine' command has been disabled and",
    "the build farm has been discontinued.");
  Console.warn();
  Console.info("As of Meteor 1.4, packages with binary dependencies are",
    "automatically compiled when they are installed in an application,",
    "assuming the target machine has a basic compiler toolchain.");
  Console.info();
  Console.info("To see the requirements for this compilation step,",
    "consult the platform requirements for 'node-gyp':");
  Console.info(
    Console.url("https://github.com/nodejs/node-gyp"),
    Console.options({ indent: 2 })
  );
  Console.info();
  return 1;
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
}, async function (options) {
  await buildmessage.enterJob({ title: "A test progressbar" }, async function () {

    var progress = buildmessage.getCurrentProgressTracker();
    var totalProgress = { current: 0, end: options.secs, done: false };
    var i = 0;
    var n = options.secs;

    if (options.spinner) {
      totalProgress.end = undefined;
    }

    await new Promise(function (resolve) {
      function updateProgress() {
        i++;
        if (! options.spinner) {
          totalProgress.current = i;
        }

        if (i === n) {
          totalProgress.done = true;
          progress.reportProgress(totalProgress);
          resolve();
        } else {
          progress.reportProgress(totalProgress);
          setTimeout(updateProgress, 1000);
        }
      }

      setTimeout(updateProgress);
    })
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
    if (_.has(options, key)) {
      return JSON.stringify(options[key]);
    }
    return 'none';
  };

  Console.info(p('ething') + " " + p('port') + " " + p('changed') +
                       " " + p('args'));
  if (options.url) {
    Console.info('url');
  }
  if (options['delete']) {
    Console.info('delete');
  }
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
