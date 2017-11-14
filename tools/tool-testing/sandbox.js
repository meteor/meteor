// Represents an install of the tool. Creating this creates a private
// sandbox with its own state, separate from the state of the current
// meteor install or checkout, from the user's homedir, and from the
// state of any other sandbox. It also creates an empty directory
// which will be, by default, the cwd for runs created inside the
// sandbox (you can change this with the cd() method).
//
// This will throw TestFailure if it has to build packages to set up
// the sandbox and the build fails. So, only call it from inside
// tests.
//
// options:
// - warehouse: set to sandbox the warehouse too. If you don't do
//   this, the tests are run in the same context (checkout or
//   warehouse) as the actual copy of meteor you're running (the
//   meteor in 'meteor self-test'. This may only be set when you're
//   running 'meteor self-test' from a checkout. If it is set, it
//   should look something like this:
//   {
//     version1: { tools: 'tools1', notices: (...) },
//     version2: { tools: 'tools2', upgraders: ["a"],
//     notices: (...), latest: true }
//   }
//   This would set up a simulated warehouse with two releases in it,
//   one called 'version1' and having a tools version of 'tools1', and
//   similarly with 'version2'/'tools2', with the latter being marked
//   as the latest release, and the latter also having a single
//   upgrader named "a". The releases are made by building the
//   checkout into a release, and are identical except for their
//   version names. If you pass 'notices' (which is optional), set it
//   to the verbatim contents of the notices.json file for the
//   release, as an object.
// - fakeMongo: if set, set an environment variable that causes our
//   'fake-mongod' stub process to be started instead of 'mongod'. The
//   tellMongo method then becomes available on Runs for controlling
//   the stub.
// - clients
//   - browserstack: true if browserstack clients should be used
//   - port: the port that the clients should run on
import * as files from '../fs/files.js';
import PhantomClient from './clients/phantom.js';
import BrowserStackClient from './clients/browserstack.js';
import Builder from '../isobuild/builder.js';
import Run from './run.js';
import { Console } from '../console/console.js';
import {
  getPackagesDirectoryName,
  getPackageStorage,
} from '../meteor-services/config.js';
import { host as archInfoHost } from '../utils/archinfo.js';
import { current as releaseCurrent } from '../packaging/release.js';
import { FinishedUpgraders } from '../project-context.js';
import { allUpgraders } from '../upgraders.js';
import { DEFAULT_TRACK } from '../packaging/catalog/catalog.js';
import { RemoteCatalog } from '../packaging/catalog/catalog-remote.js';
import { IsopackCache } from '../isobuild/isopack-cache.js';
import { randomToken } from '../utils/utils.js';
import { Tropohouse } from '../packaging/tropohouse.js';
import { PackageMap } from '../packaging/package-map.js';
import { capture, enterJob } from '../utils/buildmessage.js';

const hasOwn = Object.prototype.hasOwnProperty;

export default class Sandbox {
  constructor(options) {
    // default options
    options = Object.assign({ clients: {} }, options);

    this.root = files.mkdtemp();
    this.warehouse = null;

    this.home = files.pathJoin(this.root, 'home');
    files.mkdir(this.home, 0o755);
    this.cwd = this.home;
    this.env = {};
    this.fakeMongo = options.fakeMongo;

    if (hasOwn.call(options, 'warehouse')) {
      if (!files.inCheckout()) {
        throw Error("make only use a fake warehouse in a checkout");
      }
      this.warehouse = files.pathJoin(this.root, 'tropohouse');
      this._makeWarehouse(options.warehouse);
    }

    this.clients = [new PhantomClient({
      host: 'localhost',
      port: options.clients.port || 3000,
    })];

    if (options.clients && options.clients.browserstack) {
      const browsers = [
        { browserName: 'firefox' },
        { browserName: 'chrome' },
        { browserName: 'internet explorer',
          browserVersion: '11' },
        { browserName: 'internet explorer',
          browserVersion: '8',
          timeout: 60 },
        { browserName: 'safari' },
        { browserName: 'android' },
      ];

      Object.keys(browsers).forEach((browserKey) => {
        const browser = browsers[browserKey];
        this.clients.push(new BrowserStackClient(
          {
            host: 'localhost',
            port: 3000,
            browserName: browser.browserName,
            browserVersion: browser.browserVersion,
            timeout: browser.timeout,
          },
        ));
      });
    }

    const meteorScript = process.platform === "win32" ? "meteor.bat" : "meteor";

    // Figure out the 'meteor' to run
    if (this.warehouse) {
      this.execPath = files.pathJoin(this.warehouse, meteorScript);
    } else {
      this.execPath = files.pathJoin(files.getCurrentToolsDir(), meteorScript);
    }
  }

  // Create a new test run of the tool in this sandbox.
  run(...args) {
    return new Run(this.execPath, {
      sandbox: this,
      args,
      cwd: this.cwd,
      env: this._makeEnv(),
      fakeMongo: this.fakeMongo,
    });
  }

  // Tests a set of clients with the argument function. Each call to f(run)
  // instantiates a Run with a different client.
  // Use:
  // sandbox.testWithAllClients(function (run) {
  //   // pre-connection checks
  //   run.connectClient();
  //   // post-connection checks
  // });
  testWithAllClients(f, ...args) {
    args = args.filter(arg => arg);

    console.log("running test with " + this.clients.length + " client(s).");

    Object.keys(this.clients).forEach((clientKey) => {
      const client = this.clients[clientKey];
      console.log("testing with " + client.name + "...");
      const run = new Run(this.execPath, {
        sandbox: this,
        args,
        cwd: this.cwd,
        env: this._makeEnv(),
        fakeMongo: this.fakeMongo,
        client,
      });
      run.baseTimeout = client.timeout;
      f(run);
    });
  }

  // Copy an app from a template into the current directory in the
  // sandbox. 'to' is the subdirectory to put the app in, and
  // 'template' is a subdirectory of tools/tests/apps to copy.
  //
  // Note that the arguments are the opposite order from 'cp'. That
  // seems more intuitive to me -- if you disagree, my apologies.
  //
  // For example:
  //   s.createApp('myapp', 'empty');
  //   s.cd('myapp');
  createApp(to, template, options) {
    options = options || {};
    const absoluteTo = files.pathJoin(this.cwd, to);
    files.cp_r(files.pathJoin(
      files.convertToStandardPath(__dirname), '..', 'tests', 'apps', template),
        absoluteTo, { ignore: [/^local$/] });
    // If the test isn't explicitly managing a mock warehouse, ensure that apps
    // run with our release by default.
    if (options.release) {
      this.write(files.pathJoin(to, '.meteor/release'), options.release);
    } else if (!this.warehouse && releaseCurrent.isProperRelease()) {
      this.write(files.pathJoin(to, '.meteor/release'), releaseCurrent.name);
    }

    // Make sure the apps don't run any upgraders, unless they intentionally
    // have a partial upgraders file
    const upgradersFile =
      new FinishedUpgraders({ projectDir: absoluteTo });
    if (upgradersFile.readUpgraders().length === 0) {
      upgradersFile.appendUpgraders(allUpgraders());
    }

    require("../cli/default-npm-deps.js").install(absoluteTo);

    if (options.dontPrepareApp) {
      return;
    }

    // Prepare the app (ie, build or download packages). We give this a nice
    // long timeout, which allows the next command to not need a bloated
    // timeout. (meteor create does this anyway.)
    this.cd(to, () => {
      const run = this.run("--prepare-app");
      // XXX Can we cache the output of running this once somewhere, so that
      // multiple calls to createApp with the same template get the same cache?
      // This is a little tricky because isopack-buildinfo.json uses absolute
      // paths.
      run.waitSecs(120);
      run.expectExit(0);
    });
  }

  // Same as createApp, but with a package.
  //
  // @param packageDir  {String} The directory in which to create the package
  // @param packageName {String} The package name to create. This string will
  //                             replace all appearances of ~package-name~
  //                             in any package*.js files in the template
  // @param template    {String} The package template to use. Found as a
  //                             subdirectory in tests/packages/
  //
  // For example:
  //   s.createPackage('me_mypack', me:mypack', 'empty');
  //   s.cd('me_mypack');
  createPackage(packageDir, packageName, template) {
    const packagePath = files.pathJoin(this.cwd, packageDir);
    const templatePackagePath = files.pathJoin(
      files.convertToStandardPath(__dirname), '..', 'tests', 'packages', template);
    files.cp_r(templatePackagePath, packagePath);

    files.readdir(packagePath).forEach((file) => {
      if (file.match(/^package.*\.js$/)) {
        const packageJsFile = files.pathJoin(packagePath, file);
        files.writeFile(
          packageJsFile,
          files.readFile(packageJsFile, "utf8")
            .replace("~package-name~", packageName));
      }
    });
  }

  // Change the cwd to be used for subsequent runs. For example:
  //   s.run('create', 'myapp').expectExit(0);
  //   s.cd('myapp');
  //   s.run('add', 'somepackage') ...
  // If you provide a callback, it will invoke the callback and then
  // change the cwd back to the previous value.  eg:
  //   s.cd('app1', function () {
  //     s.run('add', 'somepackage');
  //   });
  //   s.cd('app2', function () {
  //     s.run('add', 'somepackage');
  //   });
  cd(relativePath, callback) {
    const previous = this.cwd;
    this.cwd = files.pathResolve(this.cwd, relativePath);
    if (callback) {
      callback();
      this.cwd = previous;
    }
  }

  // Set an environment variable for subsequent runs.
  set(name, value) {
    this.env[name] = value;
  }

  // Undo set().
  unset(name) {
    delete this.env[name];
  }

  // Write to a file in the sandbox, overwriting its current contents
  // if any. 'filename' is a path intepreted relative to the Sandbox's
  // cwd. 'contents' is a string (utf8 is assumed).
  write(filename, contents) {
    files.writeFile(files.pathJoin(this.cwd, filename), contents, 'utf8');
  }

  // Like writeFile, but appends rather than writes.
  append(filename, contents) {
    files.appendFile(files.pathJoin(this.cwd, filename), contents, 'utf8');
  }

  // Reads a file in the sandbox as a utf8 string. 'filename' is a
  // path intepreted relative to the Sandbox's cwd.  Returns null if
  // file does not exist.
  read(filename) {
    const file = files.pathJoin(this.cwd, filename);
    if (!files.exists(file)) {
      return null;
    } else {
      return files.readFile(files.pathJoin(this.cwd, filename), 'utf8');
    }
  }

  // Copy the contents of one file to another.  In these series of tests, we often
  // want to switch contents of package.js files. It is more legible to copy in
  // the backup file rather than trying to write into it manually.
  cp(from, to) {
    const contents = this.read(from);
    if (!contents) {
      throw new Error("File " + from + " does not exist.");
    };
    this.write(to, contents);
  }

  // Delete a file in the sandbox. 'filename' is as in write().
  unlink(filename) {
    files.unlink(files.pathJoin(this.cwd, filename));
  }

  // Make a directory in the sandbox. 'filename' is as in write().
  mkdir(dirname) {
    const dirPath = files.pathJoin(this.cwd, dirname);
    if (! files.exists(dirPath)) {
      files.mkdir(dirPath);
    }
  }

  // Rename something in the sandbox. 'oldName' and 'newName' are as in write().
  rename(oldName, newName) {
    files.rename(files.pathJoin(this.cwd, oldName),
                 files.pathJoin(this.cwd, newName));
  }

  // Return the current contents of .meteorsession in the sandbox.
  readSessionFile() {
    return files.readFile(files.pathJoin(this.root, '.meteorsession'), 'utf8');
  }

  // Overwrite .meteorsession in the sandbox with 'contents'. You
  // could use this in conjunction with readSessionFile to save and
  // restore authentication states.
  writeSessionFile(contents) {
    return files.writeFile(files.pathJoin(this.root, '.meteorsession'),
                           contents, 'utf8');
  }

  _makeEnv() {
    const env = Object.assign(Object.create(null), this.env);
    env.METEOR_SESSION_FILE = files.convertToOSPath(
      files.pathJoin(this.root, '.meteorsession'));

    if (this.warehouse) {
      // Tell it where the warehouse lives.
      env.METEOR_WAREHOUSE_DIR = files.convertToOSPath(this.warehouse);

      // Don't ever try to refresh the stub catalog we made.
      env.METEOR_OFFLINE_CATALOG = "t";
    }

    // By default (ie, with no mock warehouse and no --release arg) we should be
    // testing the actual release this is built in, so we pretend that it is the
    // latest release.
    if (!this.warehouse && releaseCurrent.isProperRelease()) {
      env.METEOR_TEST_LATEST_RELEASE = releaseCurrent.name;
    }

    // Allow user to set TOOL_NODE_FLAGS for self-test app.
    if (process.env.TOOL_NODE_FLAGS && ! process.env.SELF_TEST_TOOL_NODE_FLAGS)
      console.log('Consider setting SELF_TEST_TOOL_NODE_FLAGS to configure ' +
                  'self-test test applicaion spawns');
    env.TOOL_NODE_FLAGS = process.env.SELF_TEST_TOOL_NODE_FLAGS || '';

    return env;
  }

  // Writes a stub warehouse (really a tropohouse) to the directory
  // this.warehouse. This warehouse only contains a meteor-tool package and some
  // releases containing that tool only (and no packages).
  //
  // packageServerUrl indicates which package server we think we are using. Use
  // the default, if we do not pass this in; you should pass it in any case that
  // you will be specifying $METEOR_PACKAGE_SERVER_URL in the environment of a
  // command you are running in this sandbox.
  _makeWarehouse(releases) {
    // Ensure we have a tropohouse to copy stuff out of.
    setUpBuiltPackageTropohouse();

    const serverUrl = this.env.METEOR_PACKAGE_SERVER_URL;
    const packagesDirectoryName = getPackagesDirectoryName(serverUrl);

    const builder = new Builder({outputPath: this.warehouse});
    builder.copyDirectory({
      from: files.pathJoin(builtPackageTropohouseDir, 'packages'),
      to: packagesDirectoryName,
      symlink: true
    });
    builder.complete();

    const stubCatalog = {
      syncToken: {},
      formatVersion: "1.0",
      collections: {
        packages: [],
        versions: [],
        builds: [],
        releaseTracks: [],
        releaseVersions: []
      }
    };

    const packageVersions = {};
    let toolPackageVersion = null;

    tropohouseIsopackCache.eachBuiltIsopack((packageName, isopack) => {
      const packageRec = tropohouseLocalCatalog.getPackage(packageName);
      if (! packageRec) {
        throw Error("no package record for " + packageName);
      }
      stubCatalog.collections.packages.push(packageRec);

      const versionRec = tropohouseLocalCatalog.getLatestVersion(packageName);
      if (! versionRec) {
        throw Error("no version record for " + packageName);
      }
      stubCatalog.collections.versions.push(versionRec);

      stubCatalog.collections.builds.push({
        buildArchitectures: isopack.buildArchitectures(),
        versionId: versionRec._id,
        _id: randomToken()
      });

      if (packageName === "meteor-tool") {
        toolPackageVersion = versionRec.version;
      } else {
        packageVersions[packageName] = versionRec.version;
      }
    });

    if (! toolPackageVersion) {
      throw Error("no meteor-tool?");
    }

    stubCatalog.collections.releaseTracks.push({
      name: DEFAULT_TRACK,
      _id: randomToken()
    });

    // Now create each requested release.
    Object.keys(releases).forEach((releaseName) => {
      const configuration = releases[releaseName];
      // Release info
      stubCatalog.collections.releaseVersions.push({
        track: DEFAULT_TRACK,
        _id: Math.random().toString(),
        version: releaseName,
        orderKey: releaseName,
        description: "test release " + releaseName,
        recommended: !!configuration.recommended,
        tool: configuration.tool || "meteor-tool@" + toolPackageVersion,
        packages: packageVersions
      });
    });

    const dataFile = getPackageStorage({
      root: this.warehouse,
      serverUrl: serverUrl
    });
    this.warehouseOfficialCatalog = new RemoteCatalog();
    this.warehouseOfficialCatalog.initialize({
      packageStorage: dataFile
    });
    this.warehouseOfficialCatalog.insertData(stubCatalog);

    // And a cherry on top
    // XXX this is hacky
    files.linkToMeteorScript(
      files.pathJoin(this.warehouse, packagesDirectoryName, "meteor-tool", toolPackageVersion,
        'mt-' + archInfoHost(), 'meteor'),
      files.pathJoin(this.warehouse, 'meteor'));
  }
}

function doOrThrow(f) {
  let ret;
  const messages = capture(function () {
    ret = f();
  });
  if (messages.hasMessages()) {
    throw Error(messages.formatMessages());
  }
  return ret;
}

function setUpBuiltPackageTropohouse() {
  if (builtPackageTropohouseDir) {
    return;
  }
  builtPackageTropohouseDir = files.mkdtemp('built-package-tropohouse');

  if (getPackagesDirectoryName() !== 'packages') {
    throw Error("running self-test with METEOR_PACKAGE_SERVER_URL set?");
  }

  const tropohouse = new Tropohouse(builtPackageTropohouseDir);
  tropohouseLocalCatalog = newSelfTestCatalog();
  const versions = {};
  tropohouseLocalCatalog.getAllNonTestPackageNames().forEach((packageName) => {
    versions[packageName] =
      tropohouseLocalCatalog.getLatestVersion(packageName).version;
  });
  const packageMap = new PackageMap(versions, {
    localCatalog: tropohouseLocalCatalog
  });
  // Make an isopack cache that doesn't automatically save isopacks to disk and
  // has no access to versioned packages.
  tropohouseIsopackCache = new IsopackCache({
    packageMap: packageMap,
    includeCordovaUnibuild: true
  });
  doOrThrow(function () {
    enterJob("building self-test packages", () => {
      // Build the packages into the in-memory IsopackCache.
      tropohouseIsopackCache.buildLocalPackages(
        ROOT_PACKAGES_TO_BUILD_IN_SANDBOX);
    });
  });

  // Save all the isopacks into builtPackageTropohouseDir/packages.  (Note that
  // we are always putting them into the default 'packages' (assuming
  // $METEOR_PACKAGE_SERVER_URL is not set in the self-test process itself) even
  // though some tests will want them to be under
  // 'packages-for-server/test-packages'; we'll fix this in _makeWarehouse.
  tropohouseIsopackCache.eachBuiltIsopack((name, isopack) => {
    tropohouse._saveIsopack(isopack, name);
  });
}

// Our current strategy for running tests that need warehouses is to build all
// packages from the checkout into this temporary tropohouse directory, and for
// each test that need a fake warehouse, copy the built packages into the
// test-specific warehouse directory.  This isn't particularly fast, but it'll
// do for now. We build the packages during the first test that needs them.
let builtPackageTropohouseDir = null;
let tropohouseLocalCatalog = null;
let tropohouseIsopackCache = null;

// Let's build a minimal set of packages that's enough to get self-test
// working.  (And that doesn't need us to download any Atmosphere packages.)
const ROOT_PACKAGES_TO_BUILD_IN_SANDBOX = [
  // We need the tool in order to run from the fake warehouse at all.
  "meteor-tool",

  // We need the packages in the skeleton app in order to test 'meteor create'.
  'meteor-base',
  'mobile-experience',
  'mongo',
  'blaze-html-templates',
  'session',
  'jquery',
  'tracker',
  "autopublish",
  "insecure",
  "standard-minifier-css",
  "standard-minifier-js",
  "es5-shim",
  "shell-server"
];

function newSelfTestCatalog() {
  if (! files.inCheckout()) {
    throw Error("Only can build packages from a checkout");
  }

  const catalogLocal = require('../packaging/catalog/catalog-local.js');
  const selfTestCatalog = new catalogLocal.LocalCatalog;
  const messages = capture(
    { title: "scanning local core packages" },
    () => {
      const packagesDir =
        files.pathJoin(files.getCurrentToolsDir(), 'packages');

      // When building a fake warehouse from a checkout, we use local packages,
      // but *ONLY THOSE FROM THE CHECKOUT*: not app packages or $PACKAGE_DIRS
      // packages.  One side effect of this: we really really expect them to all
      // build, and we're fine with dying if they don't (there's no worries
      // about needing to springboard).
      selfTestCatalog.initialize({
        localPackageSearchDirs: [
          packagesDir,
          files.pathJoin(packagesDir, "non-core", "*", "packages"),
        ],
      });
    });
  if (messages.hasMessages()) {
    Console.arrowError("Errors while scanning core packages:");
    Console.printMessages(messages);
    throw new Error("scan failed?");
  }
  return selfTestCatalog;
}
