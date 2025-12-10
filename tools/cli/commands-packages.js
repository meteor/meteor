var main = require('./main.js');
var _ = require('underscore');
var files = require('../fs/files');
var buildmessage = require('../utils/buildmessage.js');
var auth = require('../meteor-services/auth.js');
var config = require('../meteor-services/config.js');
var utils = require('../utils/utils.js');
var httpHelpers = require('../utils/http-helpers.js');
var compiler = require('../isobuild/compiler.js');
var catalog = require('../packaging/catalog/catalog.js');
var catalogRemote = require('../packaging/catalog/catalog-remote.js');
var isopack = require('../isobuild/isopack.js');
var Console = require('../console/console.js').Console;
var projectContextModule = require('../project-context.js');
var colonConverter = require('../utils/colon-converter.js');
var catalogUtils = require('../packaging/catalog/catalog-utils.js');

var release = require('../packaging/release.js');
var packageVersionParser = require('../packaging/package-version-parser.js');
var updater = require('../packaging/updater.js');
var packageMapModule = require('../packaging/package-map.js');
var packageClient = require('../packaging/package-client.js');
var tropohouse = require('../packaging/tropohouse.js');

import {
  ensureDevBundleDependencies,
  newPluginId,
  splitPluginsAndPackages,
} from '../cordova/index.js';
import { updateMeteorToolSymlink } from "../packaging/updater.js";

// For each release (or package), we store a meta-record with its name,
// maintainers, etc. This function takes in a name, figures out if
// it is a release or a package, and fetches the correct record.
//
// Specifically, it returns an object with the following keys:
//  - record : (a package or version record)
//  - isRelease : true if it is a release instead of a package.
var getReleaseOrPackageRecord = async function(name) {
  var rec = await catalog.official.getPackage(name);
  var rel = false;
  if (!rec) {
    // Not a package! But is it a release track?
    rec = await catalog.official.getReleaseTrack(name);
    if (rec) {
      rel = true;
    }
  }
  return { record: rec, isRelease: rel };
};

// Seriously, this dies if it can't refresh. Only call it if you're sure you're
// OK that the command doesn't work while offline.
var refreshOfficialCatalogOrDie = async function (options) {
  const isUpToDate = await catalog.refreshOrWarn(options);
  if (!isUpToDate) {
    Console.error(
      "This command requires an up-to-date package catalog. Exiting.");
    throw new main.ExitWithCode(1);
  }
};

var removeIfEndsWith = function (s, suffix) {
  if (s.endsWith(suffix)) {
    return s.substring(0, s.length - suffix.length);
  }
  return s;
};

// Internal use only. Makes sure that your Meteor install is totally good to go
// (is "airplane safe"). Specifically, it:
//    - Builds all local packages, even those you're not using in your current
//      app. (If you're not in an app, it still does this even though there is
//      no persistent IsopackCache, because this still causes npm dependencies
//      to be downloaded.)
//    - Ensures that all packages in your current release are downloaded, even
//      those you're not using in your current app.
//    - Ensures that all packages used by your app (if any) are downloaded
// (It also ensures you have the dev bundle downloaded, just like every command
// in a checkout.)
//
// The use case is, for example, cloning an app from github, running this
// command, then getting on an airplane.
//
// This does NOT guarantee a *re*build of all local packages (though it will
// download any new dependencies): we still trust the buildinfo files in your
// app's IsopackCache. If you want to rebuild all local packages that are used
// in your app, call meteor rebuild. That said, rebuild should only be necessary
// if there's a bug in the build tool... otherwise, packages should be rebuilt
// whenever necessary!
main.registerCommand({
  name: '--get-ready',
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false }),
  options: {
    'allow-incompatible-update': { type: Boolean }
  }
}, async function (options) {

  // If we're in an app, make sure that we can build the current app. Otherwise
  // just make sure that we can build some fake app.
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir || files.mkdtemp('meteor-get-ready'),
    neverWriteProjectConstraintsFile: true,
    neverWritePackageMap: true,
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });
  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.initializeCatalog();
  });

  // Add every local package (including tests) and every release package to this
  // project. (Hopefully they can all be built at once!)
  var addPackages = function (packageNames) {
    projectContext.projectConstraintsFile.addConstraints(
      _.map(packageNames, function (p) {
        return utils.parsePackageConstraint(p);
      })
    );
  };
  addPackages(projectContext.localCatalog.getAllPackageNames());
  if (release.current.isProperRelease()) {
    addPackages(Object.keys(release.current.getPackages()));
  }

  // Now finish building and downloading.
  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.prepareProjectForBuild();
  });
  // We don't display package changes because they'd include all these packages
  // not actually in the app!
  // XXX Maybe we should do a first pass that only builds packages actually in
  // the app and does display the PackageMapDelta?
  return 0;
});


// Internal use only. A simpler version of --get-ready which doesn't try to also
// build/download local and release packages that aren't currently used. Just
// builds and downloads packages used by the current app.
main.registerCommand({
  name: '--prepare-app',
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never(),
  options: {
    'allow-incompatible-update': { type: Boolean }
  }
}, async function (options) {
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });

  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.prepareProjectForBuild();
  });

  projectContext.packageMapDelta.displayOnConsole();
});


///////////////////////////////////////////////////////////////////////////////
// publish a package
///////////////////////////////////////////////////////////////////////////////

// Updates the metadata for a given package version. Prints user-friendly
// messages if certain new values are invalid; calls to the packageClient to
// perform the actual update.
//
// Takes in a packageSource and a connection to the package server. Returns 0 on
// success and an exit code on failure.
var updatePackageMetadata = async function (packageSource, conn) {
    var name = packageSource.name;
    var version = packageSource.version;

    // You can't change the metadata of a record that doesn't exist.
    var existingRecord =
          await catalog.official.getVersion(name, version);
    if (! existingRecord) {
      Console.error(
        "You can't call",  Console.command("`meteor publish --update`"),
        "on version " + version + " of " + "package '" + name +
          "' without publishing it first.");
      return 1;
    }

    // Load in the user's documentation, and check that it isn't blank.
    var readmeInfo;
    await main.captureAndExit(
      "=> Errors while publishing:", "reading documentation",
      function () {
       readmeInfo = packageSource.processReadme();
    });

    // You are still not allowed to upload a blank README.md.
    if (readmeInfo && readmeInfo.hash === files.blankHash) {
      Console.error(
        "Your documentation file is blank, so users may have trouble",
        "figuring out how to use your package. Please fill it out, or",
        "set 'documentation: null' in your Package.describe.");
      return 1;
    };

    // Finally, call to the server.
    await main.captureAndExit(
      "=> Errors while publishing:",
      "updating package metadata",
      async function () {
        await packageClient.updatePackageMetadata({
          packageSource: packageSource,
          readmeInfo: readmeInfo,
          connection: conn
        });
    });

    Console.info(
      "Success. You can take a look at the new metadata by running",
      Console.command("'meteor show " + name + "@" + version + "'"),
      "outside the current project directory.");

    // Refresh, so that we actually learn about the thing we just published.
    await refreshOfficialCatalogOrDie();
    return 0;
};

main.registerCommand({
  name: 'publish',
  minArgs: 0,
  maxArgs: 0,
  options: {
    create: { type: Boolean },
    update: { type: Boolean },
    // This is similar to publish-for-arch, but uses the source code you have
    // locally (and other local packages you may have) instead of downloading
    // the source bundle. It does verify that the source is the same, though.
    // Good for bootstrapping things in the core release.
    'existing-version': { type: Boolean },
    // This is the equivalent of "sudo": make sure that administrators don't
    // accidentally put their personal packages in the top level namespace.
    'top-level': { type: Boolean },
    // An option to publish despite linting errors
    'no-lint': { type: Boolean }
  },
  requiresPackage: true,
  // We optimize the workflow by using up-to-date package data to weed out
  // obviously incorrect submissions before they ever hit the wire.
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false }),
  'allow-incompatible-update': { type: Boolean }
}, async function (options) {
  if (options.create && options['existing-version']) {
    // Make up your mind!
    Console.error(
      "The --create and --existing-version options cannot",
      "both be specified.");
    return 1;
  }

  if (options.update && options.create) {
    Console.error(
      "The --create and --update options cannot both be specified.");
    return 1;
  }

  if (options.update && options["existing-version"]) {
    Console.error(
      "The --update option implies that the version already exists.",
      "You do not need to use the --existing-version flag with --update.");
    return 1;
  }

  var projectContext;
  if (! options.appDir) {
    // We're not in an app? OK, make a temporary app directory, and make sure
    // that the current package directory is found by its local catalog.
    var tempProjectDir = files.mkdtemp('meteor-package-build');
    projectContext = new projectContextModule.ProjectContext({
      projectDir: tempProjectDir,  // won't have a packages dir, that's OK
      explicitlyAddedLocalPackageDirs: [options.packageDir],
      packageMapFilename: files.pathJoin(options.packageDir, '.versions'),
      // We always want to write our '.versions' package map, overriding a
      // comparison against the value of a release file that doesn't exist.
      alwaysWritePackageMap: true,
      // When we publish, we should always include web.cordova unibuilds, even
      // though this temporary directory does not have any cordova platforms
      forceIncludeCordovaUnibuild: true,
      allowIncompatibleUpdate: options['allow-incompatible-update'],
      lintPackageWithSourceRoot: options['no-lint'] ? null : options.packageDir,
    });
  } else {
    // We're in an app; let the app be our context, but make sure we don't
    // overwrite .meteor/packages or .meteor/versions when we add some temporary
    // constraints (which ensure that we can actually build the package and its
    // tests).
    projectContext = new projectContextModule.ProjectContext({
      projectDir: options.appDir,
      neverWriteProjectConstraintsFile: true,
      neverWritePackageMap: true,
      // When we publish, we should always include web.cordova unibuilds, even
      // if this project does not have any cordova platforms
      forceIncludeCordovaUnibuild: true,
      allowIncompatibleUpdate: options['allow-incompatible-update'],
      lintPackageWithSourceRoot: options['no-lint'] ? null : options.packageDir,
    });
  }

  await main.captureAndExit("=> Errors while initializing project:", async function () {
    // Just get up to initializing the catalog. We're going to mutate the
    // constraints file a bit before we prepare the build.
    await projectContext.initializeCatalog();
  });

  let conn;
  if (!process.env.METEOR_TEST_NO_PUBLISH) {
    // Connect to the package server and log in.
    try {
      conn = await packageClient.loggedInPackagesConnection();
    } catch (err) {
      packageClient.handlePackageServerConnectionError(err);
      return 1;
    }
    if (! conn) {
      Console.error('No connection: Publish failed.');
      return 1;
    }
  }

  var localVersionRecord = projectContext.localCatalog.getVersionBySourceRoot(
    options.packageDir);
  if (! localVersionRecord) {
    // OK, we're inside a package (ie, a directory with a package.js) and we're
    // inside an app (ie, a directory with a file named .meteor/packages) but
    // the package is not on the app's search path (ie, it's probably not
    // directly inside the app's packages directory).  That's kind of
    // weird. Let's not allow this.
    Console.error(
      "The package you are in appears to be inside a Meteor app but is not " +
       "in its packages directory. You may only publish packages that are " +
       "entirely outside of a project or that are loaded by the project " +
       "that they are inside.");
    return 1;
  }
  var packageName = localVersionRecord.packageName;
  var packageSource = projectContext.localCatalog.getPackageSource(packageName);
  if (! packageSource) {
    throw Error("no PackageSource for " + packageName);
  }

  // Anything published to the server must explicitly set a version.
  if (! packageSource.versionExplicitlyProvided) {
    Console.error("A version must be specified for the package. Set it with " +
                  "Package.describe.");
    return 1;
  }

  // If we just want to update the package metadata, then we have all we
  // need. Don't bother building the package, just update the metadata and
  // return the result.
  if (options.update) {
    return await updatePackageMetadata(packageSource, conn);
  }

  // Fail early if the package record exists, but we don't think that it does
  // and are passing in the --create flag!
  if (options.create) {
    var packageInfo = await catalog.official.getPackage(packageName);
    if (packageInfo) {
      Console.error(
        "Package already exists. To create a new version of an existing "+
        "package, do not use the --create flag!");
      return 2;
    }

    if (!options['top-level'] && !packageName.match(/:/)) {
      Console.error(
        "Only administrators can create top-level packages without an",
        "account prefix. (To confirm that you wish to create a top-level",
        "package with no account prefix, please run this command again",
        "with the --top-level option.)");
      // You actually shouldn't be able to get here without being logged in, but
      // it seems poor form to assume anything like that for the point of a
      // brief error message.
      if (auth.isLoggedIn()) {
        var properName =  auth.loggedInUsername() + ":" + packageName;
        Console.error(
          "\nDid you mean to create " + properName + " instead?"
       );
      }
      return 2;
    }
  }

  // Make sure that both the package and its test (if any) are actually built.
  _.each([packageName, packageSource.testName], function (name) {
    if (! name) {
      // for testName
      return;
    }

    // If we're already using this package, that's OK; no need to override.
    if (projectContext.projectConstraintsFile.getConstraint(name)) {
      return;
    }
    projectContext.projectConstraintsFile.addConstraints(
      [utils.parsePackageConstraint(name)]);
  });

  // Now resolve constraints and build packages.
  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.prepareProjectForBuild();
  });
  // We don't display the package map delta here, because it includes adding the
  // package's test and all the test's dependencies.

  if (!options['no-lint']) {
    const warnings = await projectContext.getLintingMessagesForLocalPackages();
    if (warnings && warnings.hasMessages()) {
      Console.arrowError(
        "Errors linting your package; run with --no-lint to ignore.");
      Console.printMessages(warnings);
      return 1;
    } else if (warnings) {
      Console.arrowInfo('Linted your package. No linting errors.');
    }
  }

  if (process.env.METEOR_TEST_NO_PUBLISH) {
    Console.error(
      'Would publish the package at this point, but since the ' +
      'METEOR_TEST_NO_PUBLISH environment variable is set, just going ' +
      'to finish here.');
    return 0;
  }

  var isopack = projectContext.isopackCache.getIsopack(packageName);
  if (! isopack) {
    // This shouldn't happen; we already threw a different error if the package
    // wasn't even in the local catalog, and we explicitly added this package to
    // the project's constraints file, so it should have been built.
    throw Error("package not built even though added to constraints?");
  }

  // We have initialized everything, so perform the publish operation.
  var binary = isopack.platformSpecific();
  await main.captureAndExit(
    "=> Errors while publishing:" + packageSource.name,
    "publishing the package",
    async function () {
      await packageClient.publishPackage({
        projectContext: projectContext,
        packageSource: packageSource,
        connection: conn,
        new: options.create,
        existingVersion: options['existing-version'],
        doNotPublishBuild: binary && !options['existing-version']
      });
    });

  Console.info('Published ' + packageName + '@' + localVersionRecord.version +
               '.');

  // We are only publishing one package, so we should close the connection, and
  // then exit with the previous error code.
  await conn.close();

  // Warn the user if their package is not good for all architectures.
  if (binary && options['existing-version']) {
    // This is an undocumented command that you are not supposed to run! We
    // assume that you know what you are doing, if you ran it, and are OK with
    // overrwriting normal compatibilities.
    Console.warn();
    Console.labelWarn("Your package contains binary code.");
  } else if (binary) {
    // Normal publish flow. Tell the user nicely.
    Console.warn();
    Console.warn("This package contains binary code which must be",
      "compiled on the architecture it will eventually run on.");
    Console.warn();
    Console.info(
      "Meteor 1.4 and higher will automatically compile packages",
      "with binary dependencies when they are installed, assuming",
      "the target machine has a basic compiler toolchain.");
    Console.info();
    Console.info("To see the requirements for this compilation step,",
      "consult the platform requirements for 'node-gyp':");
    Console.info(
      Console.url("https://github.com/nodejs/node-gyp"),
      Console.options({ indent: 2 })
    );
    Console.info();
  }

  // Refresh, so that we actually learn about the thing we just published.
  await refreshOfficialCatalogOrDie();

  return 0;
});


main.registerCommand({
  name: 'publish-for-arch',
  minArgs: 1,
  maxArgs: 1,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false }),
  // in theory, this option shouldn't be necessary, because when you run
  // publish-for-arch you want to reproduce the exact same setup as when
  // you ran 'publish', but support the option in case it comes up.
  'allow-incompatible-update': { type: Boolean }
}, async function (options) {
  // argument processing
  var all = options.args[0].split('@');
  if (all.length !== 2) {
    Console.error(
      'Incorrect argument. Please use the form of <packageName>@<version>');
    throw new main.ShowUsage;
  }
  var name = all[0];
  var versionString = all[1];

  var packageInfo = await catalog.official.getPackage(name);
  if (! packageInfo) {
    Console.error(
      "You can't call " + Console.command("`meteor publish-for-arch`") +
      "on package '" + name + "' without " +" publishing it first."
    );
    Console.error();
    Console.error(
      "To publish the package, run " +
       Console.command("`meteor publish --create` ") +
      "from the package directory.");
    Console.error();
    return 1;
  }

  var pkgVersion = await catalog.official.getVersion(name, versionString);
  if (! pkgVersion) {
    Console.error(
      "You can't call",  Console.command("`meteor publish-for-arch`"),
      "on version " + versionString + " of " + "package '" + name +
      "' without publishing it first.");
    Console.error();
    Console.error(
      "To publish the package, run " + Console.command("`meteor publish ` ") +
      "from the package directory.");
    Console.error();
    return 1;
  }

  if (! pkgVersion.source || ! pkgVersion.source.url) {
    Console.error(
      "There is no source uploaded for",
      name + '@' + versionString);
    return 1;
  }

  // No releaseName (not even null): this predates the isopack-cache
  // refactorings. Let's just springboard to Meteor 1.0 and let it deal with any
  // further springboarding based on reading a nested json file.
  if (! _.has(pkgVersion, 'releaseName')) {
    if (files.inCheckout()) {
      Console.error(
        "This package was published from an old version of meteor, " +
        "but you are running from checkout! Consider running " +
        Console.command("`meteor --release 1.0`"),
        "so we can springboard correctly.");
      process.exit(1);
    }
    throw new main.SpringboardToSpecificRelease("METEOR@1.0");
  }

  if (pkgVersion.releaseName === null) {
    if (! files.inCheckout()) {
      Console.error(
        "This package was published from a checkout of meteor!",
        "The tool cannot replicate that environment and will not even try.",
        "Please check out meteor at the " +
        "corresponding git commit and try again.");
      process.exit(1);
    }
  } else if (files.inCheckout()) {
    Console.error(
      "This package was published from a built version of meteor, " +
      "but you are running from checkout! Consider running from a " +
      "proper Meteor release with " +
      Console.command("`meteor --release " + pkgVersion.releaseName + "`"),
      "so we can springboard correctly.");
    process.exit(1);
  } else if (pkgVersion.releaseName !== release.current.name) {
    // We are in a built release, and so is the package, but it's a different
    // one. Springboard!
    throw new main.SpringboardToSpecificRelease(pkgVersion.releaseName);
  }

  // OK, either we're running from a checkout and so was the published package,
  // or we're running from the same release as the published package.

  // Download the source to the package.
  var sourceTarball = await buildmessage.enterJob("downloading package source", async function () {
    return await httpHelpers.getUrlWithResuming({
      url: pkgVersion.source.url,
      encoding: null
    });
  });

  if (buildmessage.jobHasMessages()) {
    return 1;
  }

  var sourcePath = files.mkdtemp('package-source');
  await buildmessage.enterJob("extracting package source", async () => {
    // XXX check tarballHash!
    await files.extractTarGz(sourceTarball, sourcePath);
  });

  // XXX Factor out with packageClient.bundleSource so that we don't
  // have knowledge of the tarball structure in two places.
  var packageDir = files.pathJoin(sourcePath, colonConverter.convert(name));
  if (! files.exists(packageDir)) {
    Console.error('Malformed source tarball');
    return 1;
  }

  var tempProjectDir = files.mkdtemp('meteor-package-arch-build');
  // Copy over a version lock file from the source tarball.
  var versionsFile = files.pathJoin(packageDir, '.versions');
  if (! files.exists(versionsFile)) {
    Console.error(
      "This package has no valid version lock file: are you trying to use " +
      "publish-for-arch on a core package? Publish-for-arch cannot " +
      "guarantee safety. Please use",
      Console.command("'meteor publish --existing-version'"), "instead.");
    process.exit(1);
  }
  files.copyFile(files.pathJoin(packageDir, '.versions'),
                 files.pathJoin(tempProjectDir, '.meteor', 'versions'));

  // Set up the project.
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: tempProjectDir,
    explicitlyAddedLocalPackageDirs: [packageDir],
    // When we publish, we should always include web.cordova unibuilds, even
    // though this temporary directory does not have any cordova platforms
    forceIncludeCordovaUnibuild: true,
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });
  // Just get up to initializing the catalog. We're going to mutate the
  // constraints file a bit before we prepare the build.
  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.initializeCatalog();
  });
  projectContext.projectConstraintsFile.addConstraints(
    [utils.parsePackageConstraint(name + "@=" + versionString)]);
  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.prepareProjectForBuild();
  });
  projectContext.packageMapDelta.displayOnConsole({
    title: "Some package versions changed since this package was published!"
  });

  var isopk = projectContext.isopackCache.getIsopack(name);
  if (! isopk) {
    throw Error("didn't build isopack for " + name);
  }

  var conn;
  try {
    conn = await packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  await main.captureAndExit(
    "=> Errors while publishing build:",
    ("publishing package " + name + " for architecture "
     + isopk.buildArchitectures()),
    async function () {
      await packageClient.createAndPublishBuiltPackage(
        conn, isopk, projectContext.isopackCache);
    }
  );

  Console.info('Published ' + name + '@' + versionString + '.');

  await refreshOfficialCatalogOrDie();
  return 0;
});

main.registerCommand({
  name: 'publish-release',
  minArgs: 1,
  maxArgs: 1,
  options: {
    'create-track': { type: Boolean },
    'from-checkout': { type: Boolean },
    // It is going to produce a fake error and nothing will be published
    'dry-run': { type: Boolean },
    // Normally the publish-release script will complain if the source of
    // a core package differs in any way from what was previously
    // published for the current version of the package. However, if the
    // package was deliberately republished independently from a Meteor
    // release, and those changes have not yet been merged to the master
    // branch, then the complaint may be spurious. If you have verified
    // that current release contains no meaningful changes (since the
    // previous official release) to the packages that are being
    // complained about, then you can pass the --skip-tree-hashing flag to
    // disable the treeHash check.
    'skip-tree-hashing': { type: Boolean },
  },
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, async function (options) {
  let conn
  try {
    conn = await packageClient.loggedInPackagesConnection();
  } catch (err) {
    await packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  var relConf = {};

  // Let's read the json release file. It should, at the very minimum contain
  // the release track name, the release version and some short freeform
  // description.
  try {
    var data = files.readFile(options.args[0], 'utf8');
    relConf = JSON.parse(data);
  } catch (e) {
    Console.error("Could not parse release file: " + e.message);
    return 1;
  }

  // Fill in the order key and any other generated release.json fields.
  await main.captureAndExit(
    "=> Errors in release schema:",
    "double-checking release schema",
    function () {
      // Check that the schema is valid -- release.json contains all the
      // required fields, does not contain contradicting information, etc.
      // XXX Check for unknown keys?
      if (! _.has(relConf, 'track')) {
        buildmessage.error(
          "Configuration file must specify release track. (track).");
      }
      if (! _.has(relConf, 'version')) {
        buildmessage.error(
          "Configuration file must specify release version. (version).");
      }
      if (! _.has(relConf, 'description')) {
        buildmessage.error(
          "Configuration file must contain a description (description).");
      } else if (relConf.description.length > 100) {
        buildmessage.error("Description must be under 100 characters.");
      }
      if (! options['from-checkout']) {
        if (! _.has(relConf, 'tool')) {
          buildmessage.error(
            "Configuration file must specify a tool version (tool) unless in " +
              "--from-checkout mode.");
        }
        if (! _.has(relConf, 'packages')) {
          buildmessage.error(
            "Configuration file must specify package versions (packages) " +
              "unless in --from-checkout mode.");
        }
      }

      // If you didn't specify an orderKey and it's compatible with our
      // conventional orderKey generation algorithm, use the algorithm. If you
      // explicitly specify orderKey: null, don't include one.
      if (! _.has(relConf, 'orderKey')) {
        relConf.orderKey = utils.defaultOrderKeyForReleaseVersion(
          relConf.version);
      }
      // This covers both the case of "explicitly specified {orderKey: null}"
      // and "defaultOrderKeyForReleaseVersion returned null".
      if (relConf.orderKey === null) {
        delete relConf.orderKey;
      }

      if (! _.has(relConf, 'orderKey') && relConf.recommended) {
        buildmessage.error("Recommended releases must have order keys.");
      }
      // On the main release track, we can't name the release anything beginning
      // with 0.8 and below, because those are taken for pre-troposphere
      // releases.
      if ((relConf.track === catalog.DEFAULT_TRACK)) {
        var start = relConf.version.slice(0,4);
        if (start === "0.8." || start === "0.7." ||
            start === "0.6." || start === "0.5.") {
          buildmessage.error(
            "It looks like you are trying to publish a pre-package-server " +
            "meteor release. Doing this through the package server is going " +
            "to cause a lot of confusion. Please use the old release process.");
        }
      }
    }
  );

  // Let's check if this is a known release track/ a track to which we are
  // authorized to publish before we do any complicated/long operations, and
  // before we publish its packages.
  if (! options['create-track']) {
    var trackRecord = await catalog.official.getReleaseTrack(relConf.track);
    if (!trackRecord) {
      Console.error(
        'There is no release track named ' + relConf.track +
        '. If you are creating a new track, use the --create-track flag.');
      return 1;
    }

    // Check with the server to see if we're organized (we can't due this
    // locally due to organizations).
    if (!await packageClient.amIAuthorized(relConf.track, conn, true)) {
      Console.error('You are not an authorized maintainer of ' +
                    relConf.track + ".");
      Console.error('Only authorized maintainers may publish new versions.');
      return 1;
    }
  }

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
  // option is not very useful outside of Meteor Software. Right now, to run this option on
  // a non-Meteor Software fork of meteor, someone would probably need to go through and
  // change the package names to have proper prefixes, etc.
  if (options['from-checkout']) {
    // You must be running from checkout to bundle up your checkout as a release.
    if (!files.inCheckout()) {
      Console.error("Must run from checkout to make release from checkout.");
      return 1;
    };

    // You should not use a release configuration with packages&tool *and* a
    // from checkout option, at least for now. That's potentially confusing
    // (which ones did you mean to use) and makes it likely that you did one of
    // these by accident. So, we will disallow it for now.
    if (relConf.packages || relConf.tool) {
      Console.error(
        "Setting the --from-checkout option will use the tool and packages " +
        "in your meteor checkout. " +
        "Your release configuration file should not contain that information.");
      return 1;
    }

    // Set up a temporary project context and build everything.
    var tempProjectDir = files.mkdtemp('meteor-release-build');
    var projectContext = new projectContextModule.ProjectContext({
      projectDir: tempProjectDir,  // won't have a packages dir, that's OK
      // seriously, we only want checkout packages
      ignorePackageDirsEnvVar: true,
      // When we publish, we should always include web.cordova unibuilds, even
      // though this temporary directory does not have any cordova platforms
      forceIncludeCordovaUnibuild: true
    });
    // Read metadata and initialize catalog.
    await main.captureAndExit("=> Errors while building for release:", async function () {
      await projectContext.initializeCatalog();
    });

    // Ensure that all packages and their tests are built. (We need to build
    // tests so that we can include their sources in source tarballs.)
    var allPackagesWithTests = projectContext.localCatalog.getAllPackageNames();
    /**
     * @type {Array<string>}
     */
    var allPackages = projectContext.localCatalog.getAllNonTestPackageNames({
      includeNonCore: false,
    });
    projectContext.projectConstraintsFile.addConstraints(
      _.map(allPackagesWithTests, function (p) {
        return utils.parsePackageConstraint(p);
      })
    );

    // Build!
    await main.captureAndExit("=> Errors while building for release:", async function () {
      await projectContext.prepareProjectForBuild();
    });
    // No need to display the PackageMapDelta here, since it would include all
    // of the packages!

    relConf.packages = {};
    var toPublish = [];

    await main.captureAndExit("=> Errors in release packages:", async function () {
      const publishList = [];
      for (const name of allPackages) {
        if (name === "meteor-tool") { // to be sure that is the last so things do not break
          continue;
        }
        publishList.push(name)
      }
      publishList.push("meteor-tool");
      for (const packageName of publishList) {
        await buildmessage.enterJob("checking consistency of " + packageName, async function () {
          var packageSource = projectContext.localCatalog.getPackageSource(
            packageName);
          if (! packageSource) {
            throw Error("no PackageSource for built package " + packageName);
          }

          if (! packageSource.versionExplicitlyProvided) {
            buildmessage.error(
              "A version must be specified for the package. Set it with " +
                "Package.describe.");
            return;
          }

          // Let's get the server version that this local package is
          // overwriting. If such a version exists, we will need to make sure
          // that the contents are the same.
          var oldVersionRecord = await catalog.official.getVersion(
            packageName, packageSource.version);

          // Include this package in our release.
          relConf.packages[packageName] = packageSource.version;

          // If there is no old version, then we need to publish this package.
          if (! oldVersionRecord) {
            // We are going to check if we are publishing an official
            // release. If this is an experimental or pre-release, then we are
            // not ready to commit to these package semver versions either. Any
            // packages that we should publish as part of this release should
            // have a -(something) at the end.
            var newVersion = packageSource.version;
            if (! relConf.official && newVersion.split("-").length < 2) {
              buildmessage.error(
                "It looks like you are building an experimental release or " +
                  "pre-release. Any packages we publish here should have an " +
                  "pre-release identifier at the end (eg, 1.0.0-dev). If " +
                  "this is an official release, please set official to true " +
                  "in the release configuration file.");
              return;
            }
            toPublish.push(packageName);
            Console.info(`Will publish new version for ${ packageName }: ${ packageSource.version }`);
            return;
          } else {
            var isopk = projectContext.isopackCache.getIsopack(packageName);
            if (! isopk) {
              throw Error("no isopack for " + packageName);
            }

            const existingBuild =
              // First try with the non-simplified build architecture
              // list, which is likely to be something like
              // os+web.browser+web.browser.legacy+web.cordova:
              await catalog.official.getBuildWithPreciseBuildArchitectures(
                oldVersionRecord,
                isopk.buildArchitectures(),
              ) ||
              // If that fails, fall back to the simplified architecture
              // list (e.g. os+web.browser+web.cordova), to match packages
              // published before the web.browser.legacy architecture was
              // introduced (in Meteor 1.7).
              await catalog.official.getBuildWithPreciseBuildArchitectures(
                oldVersionRecord,
                isopk.buildArchitectures(true),
              );

            var somethingChanged;

            if (! existingBuild) {
              // If the version number mentioned in package.js exists,
              // but there's no build of this architecture, then
              // either the old version was only semi-published, or
              // you've added some platform-specific dependencies but
              // haven't bumped the version number yet; either way,
              // you should probably bump the version number.
              somethingChanged = true;
            } else if (! options["skip-tree-hashing"] ||
                       // Always check the treeHash of the meteor-tool
                       // package, since it must have been modified if a
                       // new release is being published.
                       packageName === "meteor-tool") {
              // Save the isopack, just to get its hash.
              var bundleBuildResult = await packageClient.bundleBuild(
                isopk,
                projectContext.isopackCache,
              );

              somethingChanged =
                (bundleBuildResult.treeHash !== existingBuild.build.treeHash);
            }

            // if (somethingChanged) {
            //   buildmessage.error(
            //     "Something changed in package " + packageName + "@" +
            //       isopk.version + ". Please upgrade its version number.");
            // }
          }
        });
      }
    });

    if (options['dry-run']) {
      await main.captureAndExit("=> Dry run", function () {
          buildmessage.error(
            "This is not an error but it was just a validation" +
            " and nothing was published. Remove --dry-run to publish.");
        }
      )
    }

    // We now have an object of packages that have new versions on disk that
    // don't exist in the server catalog. Publish them.
    var unfinishedBuilds = {};
    for (const packageName of toPublish) {
      await main.captureAndExit(
        "=> Errors while publishing:",
        "publishing package " + packageName,
        async function () {
          var isopk = projectContext.isopackCache.getIsopack(packageName);
          if (! isopk) {
            throw Error("no isopack for " + packageName);
          }
          var packageSource = projectContext.localCatalog.getPackageSource(
            packageName);
          if (! packageSource) {
            throw Error("no PackageSource for built package " + packageName);
          }

          var binary = isopk.platformSpecific();
          await packageClient.publishPackage({
            projectContext: projectContext,
            packageSource: packageSource,
            connection: conn,
            new: ! await catalog.official.getPackage(packageName),
            doNotPublishBuild: binary
          });
          if (buildmessage.jobHasMessages()) {
            return;
          }
          Console.info(
            'Published ' + packageName + '@' + packageSource.version + '.');

          if (binary) {
            unfinishedBuilds[packageName] = packageSource.version;
          }
        });
    }

    // Set the remaining release information. For now, when we publish from
    // checkout, we always set 'meteor-tool' as the tool. We don't include the
    // tool in the packages list.
    relConf.tool="meteor-tool@" + relConf.packages["meteor-tool"];
    delete relConf.packages["meteor-tool"];
  }

  await main.captureAndExit(
    "=> Errors while publishing release:",
    "publishing release",
    async function () {
      // Create the new track, if we have been told to.
      if (options['create-track']) {
        // XXX maybe this job title should be left on the screen too?  some sort
        // of enterJob/progress option that lets you do that?
        await buildmessage.enterJob("creating a new release track", async function () {
          await packageClient.callPackageServerBM(
            conn, 'createReleaseTrack', { name: relConf.track });
        });
        if (buildmessage.jobHasMessages()) {
          return;
        }
      }

      await buildmessage.enterJob("creating a new release version", async function () {
        var record = {
          track: relConf.track,
          version: relConf.version,
          orderKey: relConf.orderKey,
          description: relConf.description,
          recommended: !!relConf.recommended,
          tool: relConf.tool,
          packages: relConf.packages
        };

        if (relConf.patchFrom) {
          await packageClient.callPackageServerBM(
            conn, 'createPatchReleaseVersion', record, relConf.patchFrom);
        } else {
          await packageClient.callPackageServerBM(
            conn, 'createReleaseVersion', record);
        }
      });
    }
  );

  // Learn about it.
  await refreshOfficialCatalogOrDie();
  Console.info("Done creating " + relConf.track  + "@" + relConf.version + "!");
  Console.info();

  if (options['from-checkout']) {
    // XXX maybe should discourage publishing if git status says we're dirty?
    var gitTag = "release/" + relConf.track  + "@" + relConf.version;
    if (config.getPackageServerFilePrefix() !== 'packages') {
      // Only make a git tag if we're on the default branch.
      Console.info("Skipping git tag: not using the main package server.");
    } else if (gitTag.indexOf(':') !== -1) {
      // XXX could run `git check-ref-format --allow-onelevel $gitTag` like we
      //     used to, instead of this simple check
      // XXX could convert : to / ?
      Console.info("Skipping git tag: bad format for git.");
    } else {
      Console.info("Creating git tag " + gitTag);
      await utils.runGitInCheckout('tag', gitTag);
      var fail = false;
      try {
        Console.info(
          "Pushing git tag (this should fail if you are not from Meteor Software)");
        await utils.runGitInCheckout('push', 'git@github.com:meteor/meteor.git',
          'refs/tags/' + gitTag);
      } catch (err) {
        Console.error(
          "Failed to push git tag. Please push git tag manually!");
        fail = true;
      }
    }

    // We need to warn the user that we didn't publish some of their
    // packages. Unlike publish, this is advanced functionality, so the user
    // should be familiar with the concept.
    if (! _.isEmpty(unfinishedBuilds)) {
      Console.warn();
      Console.labelWarn(
        "Some packages contain binary dependencies.");
      Console.warn(
          "Builds have not been published for the following packages:");
      _.each(unfinishedBuilds, function (version, name) {
        Console.warn(name + "@" + version);
      });
      // Note: we don't actually enforce the proper build machine thing. You
      // can't use publish-for-arch for meteor-tool, for example, you need to
      // use publish --existing-version and to do it from checkout. Setting that
      // up on a build machine for a one-off experimental release could be a
      // pain. In that case, I guess, you can just run publish
      // --existing-version: presumably you don't care about compatibility
      // etc. If it is an official release, you ought to use a build machine
      // though.
      Console.warn(
        "Please publish the builds separately, from a proper build machine.");
    }
  }

  return 0;
});

///////////////////////////////////////////////////////////////////////////////
// list
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'list',
  requiresApp: true,
  options: {
    'tree': { type: Boolean },
    'json': { type: Boolean },
    'weak': { type: Boolean },
    'details': { type: Boolean },
    'allow-incompatible-update': { type: Boolean }
  },
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: true })
}, async function (options) {
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });

  await main.captureAndExit("=> Errors while initializing project:", async function () {
    return await projectContext.prepareProjectForBuild();
  });

  // No need to display the PackageMapDelta here, since we're about to list all
  // of the packages anyway!
  const showJson = !!options['json'];
  const showTree = !!options['tree'];

  const suffixes = {
    topLevel: '(top level)',
    expandedAbove: '(expanded above)',
    weak: '[weak]',
    skipped: 'package skipped',
    missing: 'missing?'
  };

  if (showJson && showTree) {
    throw new Error('can only run for one option,found --json and --tree');
  }

  if (showTree || showJson) {
    const jsonOut = showJson && {};
    const showWeak = !!options['weak'];
    const showDetails = !!options['details'];
    // Load package details of all used packages (inc. dependencies)
    const packageDetails = new Map;
    await projectContext.packageMap.eachPackage(async function (name, info) {
      packageDetails.set(name, await projectContext.projectCatalog.getVersion(name, info.version));
    });

    // Build a set of top level package names
    const topLevelSet = new Set;
    projectContext.projectConstraintsFile.eachConstraint(function (constraint) {
      topLevelSet.add(constraint.package);
    });

    // Package that should not be expanded (top level or expanded already)
    const dontExpand = new Set(topLevelSet.values());

    // Recursive function that outputs each package
    const printPackage = async function ({ packageToPrint, isWeak, indent1, indent2, parent }) {
      const packageName = packageToPrint.packageName;
      const depsObj = packageToPrint.dependencies || {};
      let deps = Object.keys(depsObj).sort();
      // Ignore references to a meteor version or isobuild marker packages
      deps = deps.filter(dep => {
        return dep !== 'meteor' && !compiler.isIsobuildFeaturePackage(dep);
      });

      if (!showWeak) {
        // Filter out any weakly referenced dependencies
        deps = deps.filter(dep => {
          let references = depsObj[dep].references || [];
          let weakRef = references.length > 0 && references.every(r => r.weak);
          return !weakRef;
        });
      }

      const expandedAlready = (deps.length > 0 && dontExpand.has(packageName));
      const shouldExpand = (deps.length > 0 && !expandedAlready && !isWeak);

      // with normal tree display we send the current info to stdout
      if (showTree) {
        if (indent1 !== '') {
          indent1 += (shouldExpand ? '┬' : '─') + ' ';
        }

        let suffix = (isWeak ? suffixes.weak : '');
        if (expandedAlready) {
          suffix += topLevelSet.has(packageName)
            ? ` ${suffixes.topLevel}`
            : ` ${suffixes.expandedAbove}`
        }

        Console.info(indent1 + packageName + '@' + packageToPrint.version + suffix);
      }

      // with json we add detailed info to the json object
      if (showJson) {
        if (expandedAlready) {
          // on expanded packages we only want to add minimal information to
          // keep the json file compact, so we make the value a stirng
          if (topLevelSet.has(packageName)) {
            parent[packageName] = `${packageToPrint.version}-${suffixes.topLevel}`
          } else {
            parent[packageName] = `${packageToPrint.version}-${suffixes.expandedAbove}`
          }
        } else {
          // on non-expanded packages we want detailed information but we
          // omit falsy values in order to keep the output minimal and readable
          const entry = {};
          parent[packageName] = entry;

          const mapInfo = projectContext.packageMap.getInfo(packageName);
          const isLocal = mapInfo && mapInfo.kind === 'local';

          const infoSource = Object.assign({}, showDetails ? packageToPrint : {}, {
            version: packageToPrint.version,
            local: isLocal,
            weak: isWeak,
            newerVersion: !isLocal && await getNewerVersion(packageName, packageToPrint.version, catalog.official)
          });

          Object.entries(infoSource).forEach(([key, value]) => {
            if (value) {
              entry[key] = value;
            }
          });

          if (shouldExpand) {
            entry.dependencies = {};
          }
        }
      }

      if (shouldExpand) {
        dontExpand.add(packageName);
        let index = 0;
        for (const dep of deps) {
          const references = depsObj[dep].references || [];
          const weakRef = references.length > 0 && references.every(r => r.weak);
          const last = ((index + 1) === deps.length);
          const child = packageDetails.get(dep);

          // with normal tree display we increase indentation
          if (showTree) {
            const newIndent1 = indent2 + (last ? '└─' : '├─');
            const newIndent2 = indent2 + (last ? '  ' : '│ ');
            if (child) {
              await printPackage({
                packageToPrint: child,
                isWeak: weakRef,
                indent1: newIndent1,
                indent2: newIndent2
              });
            } else if (weakRef) {
              Console.info(`${newIndent1}─ ${dep} ${suffixes.weak} ${suffixes.skipped}`);
            } else {
              Console.info(`${newIndent1}─ ${dep} ${suffixes.missing}`);
            }
          }

          if (showJson) {
            if (child) {
              await printPackage({
                packageToPrint: child,
                isWeak: weakRef,
                parent: parent[packageName].dependencies
              });
            } else if (weakRef) {
              parent[packageName].dependencies[dep] = `${suffixes.weak} ${suffixes.skipped}`;
            } else {
              parent[packageName].dependencies = suffixes.missing;
            }
          }
          index++;
        }
      }
    };

    const topLevelNames = Array.from(topLevelSet.values()).sort();
    for (const dep of topLevelNames) {
      const topLevelPackage = packageDetails.get(dep);
      if (topLevelPackage) {
        // Force top level packages to be expanded
        dontExpand.delete(topLevelPackage.packageName);
        await printPackage({
          packageToPrint: topLevelPackage,
          isWeak: false,
          indent1: '',
          indent2: '',
          parent: jsonOut
        })
      }
    }

    if (showJson) {
      // we can't use Console here, because it pretty prints the output with
      // a wrap at 80 chars per line, which causes the json to break if details
      // options is active and the package descriptions exceed the limit
      console.info(JSON.stringify(jsonOut));
    }

    return 0;
  }

  var items = [];
  var newVersionsAvailable = false;
  var anyBuiltLocally = false;

  // Iterate over packages that are used directly by this app (not indirect
  // dependencies).
  await projectContext.projectConstraintsFile.eachConstraintAsync(async function (constraint) {
    var packageName = constraint.package;

    // Skip isobuild:* pseudo-packages.
    if (compiler.isIsobuildFeaturePackage(packageName)) {
      return;
    }

    var mapInfo = projectContext.packageMap.getInfo(packageName);
    if (! mapInfo) {
      throw Error("no version for used package " + packageName);
    }
    var versionRecord = await projectContext.projectCatalog.getVersion(
      packageName, mapInfo.version);
    if (! versionRecord) {
      throw Error("no version record for " + packageName + "@" +
                  mapInfo.version);
    }

    var versionAddendum = " ";
    if (mapInfo.kind === 'local') {
      versionAddendum = "+";
      anyBuiltLocally = true;
    } else if (mapInfo.kind === 'versioned') {
      if (await getNewerVersion(packageName, mapInfo.version, catalog.official)) {
        versionAddendum = "*";
        newVersionsAvailable = true;
      }
    } else {
      throw Error("unknown kind " + mapInfo.kind);
    }
    var description = mapInfo.version + versionAddendum;
    if (versionRecord.description) {
      description += " " + versionRecord.description;
    }
    items.push({ name: packageName, description: description });
  });

  // Append extra information about special packages such as Cordova plugins
  // to the list.
  _.each(
    projectContext.cordovaPluginsFile.getPluginVersions(),
    function (version, name) {
      items.push({ name: 'cordova:' + name, description: version });
    }
  );

  utils.printPackageList(items);

  if (newVersionsAvailable) {
    Console.info();
    Console.info(
      "New versions of these packages are available! Run",
      Console.command("'meteor update'"), "to try to update those",
      "packages to their latest versions. If your packages cannot be",
      "updated further, try typing",
      Console.command("`meteor add <package>@<newVersion>`"),
      "to see more information.",
      Console.options({ bulletPoint: "* " }));
  }
  if (anyBuiltLocally) {
    Console.info();
    Console.info(
      "These packages are built locally from source.",
      Console.options({ bulletPoint: "+ " }));
  }
  return 0;
});

var getNewerVersion = async function (packageName, curVersion, whichCatalog) {
  // Check to see if there are later versions available, returning the
  // latest version if there are.
  //
  // If we are not using an rc for this package, then we are not going to
  // update to an rc. But if we are using a pre-release version, then we
  // care about other pre-release versions, and might want to update to a
  // newer one.
  //
  // We depend on the fact that `curVersion` is in the database to know
  // that we'll find something when we look in the catalog.
  var latest;
  if (/-/.test(curVersion)) {
    latest = await whichCatalog.getLatestVersion(packageName);
  } else {
    latest = await whichCatalog.getLatestMainlineVersion(packageName);
  }
  if (! latest) {
    // Shouldn't happen: we've chosen a published version of this package,
    // so there has to be at least one in our database!
    throw Error("no latest record for package where we have a version? " +
                packageName);
  }

  var latestVersion = latest.version;
  if (curVersion !== latestVersion &&
      // If we're currently running a prerelease, "latest" may be older than
      // what we're at, so don't tell us we're outdated!
      packageVersionParser.lessThan(curVersion, latestVersion)) {
    return latestVersion;
  } else {
    return null;
  }
};

///////////////////////////////////////////////////////////////////////////////
// update
///////////////////////////////////////////////////////////////////////////////

// Returns 0 if the operation went OK -- either we updated to a new release, or
// decided not to with good reason. Returns something other than 0, if it is not
// safe to proceed (ex: our release track is fundamentally unsafe or there is
// weird catalog corruption).
var maybeUpdateRelease = async function (options) {
  // We are only updating packages, so we are not updating the release.
  if (options["packages-only"]) {
     return 0;
  }

  // We are running from checkout, so we are not updating the release.
  if (release.current && release.current.isCheckout()) {
    Console.error(
      "You are running Meteor from a checkout, so we cannot update",
      "the Meteor release. Checking to see if we can update your packages.");
    return 0;
  }

  // Looks like we are going to have to update the release. First, let's figure
  // out the release track we'll end up on --- either because it's
  // the explicitly specified (with --release) track; or because we didn't
  // specify a release and it's the app's current release (if we're in an app
  // dir), since non-forced updates don't change the track.

  // XXX better error checking on release.current.name
  // XXX add a method to release.current.
  var releaseTrack = release.current ?
        await release.current.getReleaseTrack() : catalog.DEFAULT_TRACK;

  // Unless --release was passed (in which case we ought to already have
  // springboarded to that release), go get the latest release and switch to
  // it. (We already know what the latest release is because we refreshed the
  // catalog above.)  Note that after springboarding, we will hit this again.
  // However, the override that's done by SpringboardToLatestRelease also sets
  // release.forced (although it does not set release.explicit), so we won't
  // double-springboard.  (We might miss an super recently published release,
  // but that's probably OK.)
  if (! release.forced) {
    var latestRelease = await release.latestKnown(releaseTrack);

    // Are we on some track without ANY recommended releases at all,
    // and the user ran 'meteor update' without specifying a release? We
    // really can't do much here.
    if (!latestRelease) {
      Console.error(
        "There are no recommended releases on release track " +
          releaseTrack + ".");
      return 1;
    }

    if (release.current && ! release.current.isRecommended() &&
        options.appDir && ! options.patch) {
      var releaseVersion = await release.current.getReleaseVersion();
      var newerRecommendedReleases = await getLaterReleaseVersions(
        releaseTrack, releaseVersion);
      if (!newerRecommendedReleases.length) {
        // When running 'meteor update' without --release in an app,
        // using a release that is not recommended and is newer than
        // any recommended release, don't springboard backwards to
        // an older, recommended release.  Don't update Meteor, or
        // the app's release.  This makes it possible to type `meteor update`
        // with no arguments from a new RC of Meteor, without performing
        // the update (and subsequent constraint-solving, etc.) using
        // the old tool.
        //
        // We'll still springboard forwards out of an RC, just not backwards.
        // There still has a possibility of already on the latest.
        if (release.current.name === latestRelease) {
          Console.info("Already on the latest recommended release " +
                      "(" + latestRelease + "). Not updating.");
        } else {
          Console.info("Not updating the release, because this app is at a " +
                      "newer release (" + release.current.name + ") than " +
                      "the latest recommended release " +
                      "(" + latestRelease + ").");
        }
        return 0;
      }
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
  if (! release.current || ! release.current.isProperRelease()) {
    throw new Error("don't have a proper release?");
  }

  await updateMeteorToolSymlink(true);

  // If we're not in an app, then we're basically done. The only thing left to
  // do is print out some messages explaining what happened (and advising the
  // user to run update from an app).
  if (! options.appDir) {
    if (release.forced) {
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
      Console.info(
        "Installed. Run",
        Console.command(
          "'meteor update --release " +
            release.current.getDisplayName({ noPrefix: true }) + "'"),
        "inside of a particular project directory to update that project to",
        release.current.getDisplayName() + ".");
    } else {
      // We get here if the user ran 'meteor update' and we didn't
      // find a new version.
      Console.info(
        "The latest version of Meteor, " + await release.current.getReleaseVersion() +
        ", is already installed on this computer. Run " +
        Console.command("'meteor update'") + " inside of a particular " +
        "project directory to update that project to " +
        release.current.getDisplayName());
    }
    return 0;
  }

  // Otherwise, we have to upgrade the app too, if the release changed.  Read in
  // the project metadata files.  (Don't resolve constraints yet --- if the
  // current constraints don't resolve but we can update to a place where they
  // do, that's great!)
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    alwaysWritePackageMap: true,
    allowIncompatibleUpdate: true // disregard `.meteor/versions` if necessary
  });
  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.readProjectMetadata();
  });

  if (projectContext.releaseFile.fullReleaseName === release.current.name) {
    // release.explicit here means that the user actually typed `--release FOO`,
    // so they weren't trying to go to the latest release. (This is different
    // from release.forced, which might be set due to the
    // SpringboardToLatestRelease above.)
    var maybeTheLatestRelease = release.explicit ? "" : ", the latest release";
    Console.info(
      "This project is already at " +
      release.current.getDisplayName() + maybeTheLatestRelease + ".");
    return 0;
  }

  // XXX did we have to change some package versions? we should probably
  //     mention that fact.
  // XXX error handling.

  // Previously we attempted to figure out the newest release that is compatible
  // with the users non-core version constraints. Now we simply update them
  // to the newest and if they get a conflict, they are left with a
  // .meteor/packages to work on to get a resolution (with more useful info)

  var releaseVersion;
  if (options.patch) {
    // Can't make a patch update if you are not running from a current
    // release. In fact, you are doing something wrong, so we should tell you
    // to stop.
    if (! projectContext.releaseFile.normalReleaseSpecified()) {
      Console.error(
        "Cannot patch update unless a release is set.");
      return 1;
    }
    var record = await catalog.official.getReleaseVersion(
      projectContext.releaseFile.releaseTrack,
      projectContext.releaseFile.releaseVersion);
    if (!record) {
      Console.error(
        "Cannot update to a patch release from an old release.");
      return 1;
    }
    var updateTo = record.patchReleaseVersion;
    if (!updateTo) {
      Console.error(
        "You are at the latest patch version.");
      return 0;
    }
    var patchRecord = await catalog.official.getReleaseVersion(
      projectContext.releaseFile.releaseTrack, updateTo);
    // It looks like you are not at the latest patch version,
    // technically. But, in practice, we cannot update you to the latest patch
    // version because something went wrong. For example, we can't find the
    // record for your patch version (probably some sync
    // failure). Alternatively, maybe we put out a patch release and found a
    // bug in it -- since we tell you to always run update --patch, we should
    // not try to patch you to an unfriendly release. So, either way, as far
    // as we are concerned you are at the 'latest patch version'
    if (!patchRecord || !patchRecord.recommended ) {
      Console.error("You are at the latest patch version.");
      return 0;
    }
    // Great, we found a patch version. You can only have one latest patch for
    // a string of releases, so there is just one release to try.
    releaseVersion = updateTo;
  } else if (release.explicit) {
    // You have explicitly specified a release, and we have springboarded to
    // it. So, we will use that release to update you to itself, if we can.
    releaseVersion = await release.current.getReleaseVersion();
  } else {
    // We are not doing a patch update, or a specific release update, so we need
    // to try all recommended releases on our track, whose order key is greater
    // than the app's.
    releaseVersion = (
      await getLaterReleaseVersions(
        projectContext.releaseFile.releaseTrack,
        projectContext.releaseFile.releaseVersion
      )
    )[0];

    if (! releaseVersion) {
      // We could not find any releases newer than the one that we are on, on
      // that track, so we are done.
      Console.info(
        "This project is already at " +
        Console.noWrap(projectContext.releaseFile.displayReleaseName) +
        ", which is newer than the latest release.");
      return 0;
    }
  }

  var releaseName = `${releaseTrack}@${releaseVersion}`;

  // We could at this point springboard to solutionRelease (which is no newer
  // than the release we are currently running), but there's no super-clear
  // advantage to this yet. The main reason might be if we decide to delete some
  // backward-compatibility code which knows how to deal with an older release,
  // but if we actually do that, we can change this code to add the extra
  // springboard at that time.
  var upgraders = require('../upgraders.js');
  var upgradersToRun = upgraders.upgradersToRun(projectContext);

  // Update every package in .meteor/packages to be (semver)>= the version
  // set for that package in the release we are updating to
  var releaseRecord = await catalog.official.getReleaseVersion(releaseTrack, releaseVersion);
  projectContext.projectConstraintsFile.updateReleaseConstraints(releaseRecord);

  // Download and build packages and write the new versions to .meteor/versions.
  // XXX It's a little weird that we do a full preparation for build
  //     (downloading packages, building packages, etc) when we might be about
  //     to upgrade packages and have to do it again. Maybe we shouldn't? Note
  //     that if we change this, that changes the upgraders interface, which
  //     expects a projectContext that is fully prepared for build.
  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.prepareProjectForBuild();
  });

  await projectContext.writeReleaseFileAndDevBundleLink(releaseName);

  projectContext.packageMapDelta.displayOnConsole({
    title: ("Changes to your project's package version selections from " +
            "updating the release:")
  });

  Console.info(files.pathBasename(options.appDir) + ": updated to " +
               projectContext.releaseFile.displayReleaseName + ".");

  // Now run the upgraders.
  // XXX should we also run upgraders on other random commands, in case there
  // was a crash after changing .meteor/release but before running them?
  _.each(upgradersToRun, function (upgrader) {
    upgraders.runUpgrader(projectContext, upgrader);
    projectContext.finishedUpgraders.appendUpgraders([upgrader]);
  });

  // We are done, and we should pass the release that we upgraded to, to the
  // user.
  return 0;
};

async function getLaterReleaseVersions(releaseTrack, releaseVersion) {
  var releaseInfo = await catalog.official.getReleaseVersion(
    releaseTrack, releaseVersion);
  var orderKey = (releaseInfo && releaseInfo.orderKey) || null;

  return await catalog.official.getSortedRecommendedReleaseVersions(
    releaseTrack, orderKey);
}

main.registerCommand({
  name: 'update',
  options: {
    patch: { type: Boolean },
    "packages-only": { type: Boolean },
    "allow-incompatible-update": { type: Boolean },
    "all-packages": { type: Boolean }
  },
  // We have to be able to work without a release, since 'meteor
  // update' is how you fix apps that don't have a release.
  requiresRelease: false,
  minArgs: 0,
  maxArgs: Infinity,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: true })
}, async function (options) {
  // If you are specifying packages individually, you probably don't want to
  // update the release.
  if (options.args.length > 0) {
    // In the case that user specified the package but not in a app.
    if (! options.appDir) {
      Console.error("You're not in a Meteor project directory.");
      return 1;
    }
    options["packages-only"] = true;
  }

  // Some basic checks to make sure that this command is being used correctly.
  if (options["packages-only"] && options["patch"]) {
    Console.error(
      "The --patch option only applies to the release, not packages.");
    return 1;
  }

  if (release.explicit && options["patch"]) {
    Console.error("You cannot patch update to a specific release.");
    return 1;
  }

  var releaseUpdateStatus = await maybeUpdateRelease(options);
  // If we encountered an error and cannot proceed, return.
  if (releaseUpdateStatus !== 0) {
    return releaseUpdateStatus;
  }

  // The only thing left to do is update packages, and we don't update packages
  // if we are making a patch update, updating specifically with a --release, or
  // running outside a package directory. So, we are done, return.
  if (options['patch'] || release.explicit || !options.appDir) {
    return 0;
  }

  // Start a new project context and read in the project's release and other
  // metadata. (We also want to make sure that we write the package map when
  // we're done even if we're not on the matching release!)
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    alwaysWritePackageMap: true,
    allowIncompatibleUpdate: options["allow-incompatible-update"]
  });
  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.readProjectMetadata();
  });

  // If no packages have been specified, then we will send in a request to
  // update all direct dependencies. If a specific list of packages has been
  // specified, then only upgrade those.
  var upgradePackageNames = [];
  // If no packages have been specified (`meteor update` with no positional
  // args), take patches to indirect dependencies.
  var upgradeIndirectDepPatchVersions = false;
  if (options.args.length === 0) {
    // "all-packages" means update every package we depend on. The default
    // is to tend to leave indirect dependencies (i.e. things not listed in
    // `.meteor/packages`) alone.
    if (options["all-packages"]) {
      upgradePackageNames = _.filter(
        Object.keys(projectContext.packageMapFile.getCachedVersions()),
        packageName => ! compiler.isIsobuildFeaturePackage(packageName)
      );
    }

    if (upgradePackageNames.length === 0) {
      projectContext.projectConstraintsFile.eachConstraint(function (constraint) {
        if (! compiler.isIsobuildFeaturePackage(constraint.package)) {
          upgradePackageNames.push(constraint.package);
        }
      });
    }

    upgradeIndirectDepPatchVersions = true;

  } else {
    if (options["all-packages"]) {
      Console.error("You cannot both specify a list of packages to"
       + " update and pass --all-packages.");
       process.exit(1)
    }

    upgradePackageNames = options.args;

    if (upgradePackageNames.some(name => name.includes("@"))) {
      Console.error(
        "Package names can not contain \"@\". If you are trying to",
        "update a package to a specific version, instead use",
        Console.command('"meteor add"')
      );
      process.exit(1);
    }
  }
  // We want to use the project's release for constraints even if we are
  // currently running a newer release (eg if we ran 'meteor update --patch' and
  // updated to an older patch release).  (If the project has release 'none'
  // because this is just 'updating packages', this can be null. Also, if we're
  // running from a checkout this should be null even if the file doesn't say
  // 'none'.)
  var releaseRecordForConstraints = null;
  if (! files.inCheckout() &&
      projectContext.releaseFile.normalReleaseSpecified()) {
    releaseRecordForConstraints = await catalog.official.getReleaseVersion(
      projectContext.releaseFile.releaseTrack,
      projectContext.releaseFile.releaseVersion);
    if (! releaseRecordForConstraints) {
      console.log(projectContext.releaseFile, releaseRecordForConstraints)
      throw Error("unknown release: " +
                  projectContext.releaseFile.displayReleaseName);
    }
  }

  const upgradePackagesWithoutCordova =
    upgradePackageNames.filter(name => name.split(':')[0] !== 'cordova');
  if (!_.isEqual(upgradePackagesWithoutCordova, upgradePackageNames)) {
    // There are some cordova packages in the list to update.
    // We should tell users how to update cordova packages.
    Console.warn();
    Console.warn("To add/upgrade a Cordova plugin in your Meteor project, run:");
    Console.warn();
    Console.warn(
      Console.command("meteor add cordova:PLUGIN-NAME@x.y.z"),
      Console.options({ indent: 2 }));
    Console.warn();
    Console.warn("The 'PLUGIN-NAME' should be an official plugin name",
      "(e.g. cordova-plugin-media) and the 'x.y.z' should be an available version of",
      "the plugin. The latest version can be found with the following command:");
    Console.warn();
    Console.warn(
      Console.command("meteor npm view PLUGIN-NAME version"),
      Console.options({ indent: 2 }));
    if (upgradePackagesWithoutCordova.length !== 0) {
      Console.warn();
      Console.warn('The non-Cordova packages will now be updated...');
    }
    Console.warn();
    // Exclude cordova packages
    upgradePackageNames = upgradePackagesWithoutCordova;
  }

  // Try to resolve constraints, allowing the given packages to be upgraded.
  await projectContext.reset({
    releaseForConstraints: releaseRecordForConstraints,
    upgradePackageNames: upgradePackageNames,
    upgradeIndirectDepPatchVersions: upgradeIndirectDepPatchVersions
  });
  await main.captureAndExit(
    "=> Errors while upgrading packages:", "upgrading packages", async function () {
      await projectContext.resolveConstraints();
      if (await buildmessage.jobHasMessages()) {
        return;
      }

      // If the user explicitly mentioned some packages to upgrade, they must
      // actually end up in our solution!
      if (options.args.length !== 0) {
        _.each(upgradePackageNames, function (packageName) {
          if (! projectContext.packageMap.getInfo(packageName)) {
            buildmessage.error(packageName + ': package is not in the project');
          }
        });
      }
      if (await buildmessage.jobHasMessages()) {
        return;
      }

      // Finish preparing the project.
      await projectContext.prepareProjectForBuild();
    }
  );

  if (projectContext.packageMapDelta.hasChanges()) {
    projectContext.packageMapDelta.displayOnConsole({
      title: ("Changes to your project's package version selections from " +
              "updating package versions:")
    });
  } else if (options.args.length) {
    Console.info(
      "The specified packages are at their latest compatible versions.");
  } else {
    Console.info(
      "Your top-level dependencies are at their latest compatible versions.");
  }

  if (!options.args.length) {
    // Generate and print info about what is NOT at the latest version.

    var topLevelPkgSet = {}; // direct dependencies (rather than indirect)
    projectContext.projectConstraintsFile.eachConstraint(function (constraint) {
      topLevelPkgSet[constraint.package] = true;
    });

    var nonlatestDirectDeps = [];
    var nonlatestIndirectDeps = [];
    var deprecatedDeps = [];
    await projectContext.packageMap.eachPackage(async function(name, info) {
      var selectedVersion = info.version;
      var catalog = projectContext.projectCatalog;
      var latestVersion = await getNewerVersion(name, selectedVersion, catalog);
      if (latestVersion) {
        var rec = { name: name, selectedVersion: selectedVersion,
                    latestVersion: latestVersion };
        if (_.has(topLevelPkgSet, name)) {
          nonlatestDirectDeps.push(rec);
        } else {
          nonlatestIndirectDeps.push(rec);
        }
      }
      if (info.packageSource && info.packageSource.deprecated) {
        deprecatedDeps.push({
          name: name,
          selectedVersion: selectedVersion,
          deprecatedMessage: info.packageSource.deprecatedMessage
        })
      }
    });
    var printItem = function (rec) {
      Console.info(" * " + rec.name + " " + rec.selectedVersion +
                   " (" + rec.latestVersion + " is available)");
    };
    if (nonlatestDirectDeps.length) {
      Console.info("\nThe following top-level dependencies were not updated " +
                   "to the very latest version available:");
      nonlatestDirectDeps.forEach(printItem);
    }
    if(deprecatedDeps.length) {
      Console.info("\nThe following packages have been DEPRECATED. Please consider finding replacements for them.");
      deprecatedDeps.forEach(function (item) {
        Console.info(" * " +  item.name + " " + item.selectedVersion + " " + (item.deprecatedMessage ? "(" + item.deprecatedMessage + ")" : ""));
      })
    }
    if (nonlatestIndirectDeps.length) {
      Console.info("\nNewer versions of the following indirect dependencies" +
                   " are available:");
      nonlatestIndirectDeps.forEach(printItem);
      Console.info([
        "These versions may not be compatible with your project.",
        "To update one or more of these packages to their latest",
        "compatible versions, pass their names to `meteor update`,",
        "or just run `meteor update --all-packages`.",
        "If the packages do not upgrade after this, this could mean",
        "that there is a newer version of Meteor which the package",
        "requires, but it not yet recommended or that some package",
        "dependencies are not up to date and don't allow you to get",
        "the latest package version."
      ].join("\n"));
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
// admin run-upgrader
///////////////////////////////////////////////////////////////////////////////

// For testing upgraders during development.
main.registerCommand({
  name: 'admin run-upgrader',
  hidden: true,
  minArgs: 1,
  maxArgs: 1,
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never(),
  'allow-incompatible-update': { type: Boolean }
}, async function (options) {
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    allowIncompatibleUpdate: options['allow-incompatible-update']
  });
  await main.captureAndExit("=> Errors while initializing project:", async function () {
    await projectContext.prepareProjectForBuild();
  });
  projectContext.packageMapDelta.displayOnConsole();

  var upgrader = options.args[0];

  var upgraders = require('../upgraders.js');
  console.log("%s: running upgrader %s.",
              files.pathBasename(options.appDir), upgrader);
  upgraders.runUpgrader(projectContext, upgrader);
});

///////////////////////////////////////////////////////////////////////////////
// admin run-background-updater
///////////////////////////////////////////////////////////////////////////////

// For testing the background updater during development.
main.registerCommand({
  name: 'admin run-background-updater',
  hidden: true,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  await updater.tryToDownloadUpdate({
    showBanner: true,
    printErrors: true
  });
});

///////////////////////////////////////////////////////////////////////////////
// admin wipe-all-packages
///////////////////////////////////////////////////////////////////////////////

// For testing wipeAllPackages during development
main.registerCommand({
  name: 'admin wipe-all-packages',
  hidden: true,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  tropohouse.default.wipeAllPackages();
});

///////////////////////////////////////////////////////////////////////////////
// admin check-package-versions
///////////////////////////////////////////////////////////////////////////////

// Run before publish-release --from-checkout to make sure that all of our
// version numbers are up to date
main.registerCommand({
  name: 'admin check-package-versions',
  hidden: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, async function (options) {
  if (!files.inCheckout()) {
    Console.error("Must run from checkout.");
    return 1;
  };

  // Set up a temporary project context and build everything.
  var tempProjectDir = files.mkdtemp('meteor-release-build');
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: tempProjectDir,  // won't have a packages dir, that's OK
    // seriously, we only want checkout packages
    ignorePackageDirsEnvVar: true,
    // When we publish, we should always include web.cordova unibuilds, even
    // though this temporary directory does not have any cordova platforms
    forceIncludeCordovaUnibuild: true
  });
  // Read metadata and initialize catalog.
  await main.captureAndExit("=> Errors while building for release:", async function () {
    await projectContext.initializeCatalog();
  });

  var allPackages = projectContext.localCatalog.getAllNonTestPackageNames();

  Console.info("Listing packages where the checkout version doesn't match the",
    "latest version on the package server.");

  for (const packageName of allPackages) {
    var checkout = projectContext.localCatalog.getLatestVersion(packageName);
    var remote = await catalog.official.getLatestVersion(packageName);

    if (checkout.version !== remote.version) {
      Console.info(packageName, checkout.version, remote.version);
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
// add
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'add',
  options: {
    "allow-incompatible-update": { type: Boolean }
  },
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: true })
}, async function (options) {
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    allowIncompatibleUpdate: options["allow-incompatible-update"]
  });

  await main.captureAndExit("=> Errors while initializing project:", async function () {
    // We're just reading metadata here --- we're not going to resolve
    // constraints until after we've made our changes.
    return await projectContext.initializeCatalog();
  });

  let exitCode = 0;

  // Split arguments into Cordova plugins and packages
  const { plugins: pluginsToAdd, packages: packagesToAdd } =
    splitPluginsAndPackages(options.args);

  if (!_.isEmpty(pluginsToAdd)) {
    function cordovaPluginAdd() {
      const plugins = projectContext.cordovaPluginsFile.getPluginVersions();
      let changed = false;

      for (target of pluginsToAdd) {
        const { id, version } =
          require('../cordova/package-id-version-parser.js').parse(target);
        const newId = newPluginId(id);

        if (!(version && utils.isValidVersion(version, {forCordova: true}))) {
          Console.error(`${id}: Meteor requires either an exact version \
  (e.g. ${id}@1.0.0), a Git URL with a SHA reference, or a local path.`);
          exitCode = 1;
        } else if (newId) {
          plugins[newId] = version;
          Console.info(`Added Cordova plugin ${newId}@${version} \
  (plugin has been renamed as part of moving to npm).`);
          changed = true;
        } else {
          plugins[id] = version;
          Console.info(`Added Cordova plugin ${id}@${version}.`);
          changed = true;
        }
      }

      changed && projectContext.cordovaPluginsFile.write(plugins);
    }

    await ensureDevBundleDependencies();
    await cordovaPluginAdd();
  }

  if (_.isEmpty(packagesToAdd)) {
    return exitCode;
  }

  // Messages that we should print if we make any changes, but that don't count
  // as errors.
  var infoMessages = [];
  var constraintsToAdd = [];
  // For every package name specified, add it to our list of package
  // constraints. Don't run the constraint solver until you have added all of
  // them -- add should be an atomic operation regardless of the package
  // order.
  var messages = await buildmessage.capture(async function () {
    for (const packageReq of packagesToAdd) {
      await buildmessage.enterJob("adding package " + packageReq, async function () {
        var constraint = utils.parsePackageConstraint(packageReq, {
          useBuildmessage: true
        });
        if (buildmessage.jobHasMessages()) {
          return;
        }

        // It's OK to make errors based on looking at the catalog, because this
        // is a OnceAtStart command.
        var packageRecord = await projectContext.projectCatalog.getPackage(
            constraint.package);
        if (! packageRecord) {
          buildmessage.error("no such package");
          return;
        }

        for (const subConstr of constraint.versionConstraint.alternatives) {
          if (subConstr.versionString === null) {
            continue;
          }
          // Figure out if this version exists either in the official catalog or
          // the local catalog. (This isn't the same as using the combined
          // catalog, since it's OK to type "meteor add foo@1.0.0" if the local
          // package is 1.1.0 as long as 1.0.0 exists.)
          var versionRecord = await projectContext.localCatalog.getVersion(
              constraint.package, subConstr.versionString);
          if (! versionRecord) {
            // XXX #2846 here's an example of something that might require a
            // refresh
            versionRecord = await catalog.official.getVersion(
                constraint.package, subConstr.versionString);
          }
          if (! versionRecord) {
            buildmessage.error("no such version " + constraint.package + "@" +
                subConstr.versionString);
          }
        }
        if (buildmessage.jobHasMessages()) {
          return;
        }

        var current = projectContext.projectConstraintsFile.getConstraint(
            constraint.package);

        // Check that the constraint is new. If we are already using the package
        // at the same constraint in the app, we will log an info message later
        // (if there are no other errors), but don't fail. Rejecting the entire
        // command because a part of it is a no-op is confusing.
        if (! current) {
          constraintsToAdd.push(constraint);
        } else if (! current.constraintString &&
            ! constraint.constraintString) {
          infoMessages.push(
              constraint.package +
              " without a version constraint has already been added.");
        } else if (current.constraintString === constraint.constraintString) {
          infoMessages.push(
              constraint.package + " with version constraint " +
              constraint.constraintString + " has already been added.");
        } else {
          // We are changing an existing constraint.
          if (current.constraintString) {
            infoMessages.push(
                "Currently using " + constraint.package +
                " with version constraint " + current.constraintString + ".");
          } else {
            infoMessages.push(
                "Currently using " +  constraint.package +
                " without any version constraint.");
          }
          if (constraint.constraintString) {
            infoMessages.push("The version constraint will be changed to " +
                constraint.constraintString + ".");
          } else {
            infoMessages.push("The version constraint will be removed.");
          }
          constraintsToAdd.push(constraint);
        }
      });
    }
  });
  if (messages.hasMessages()) {
    Console.arrowError("Errors while parsing arguments:", 1);
    Console.printMessages(messages);
    catalogUtils.explainIfRefreshFailed();  // this is why we're not using captureAndExit
    return 1;
  }

  projectContext.projectConstraintsFile.addConstraints(constraintsToAdd);

  // Run the constraint solver, download packages, etc.
  messages = await buildmessage.capture(function () {
    return projectContext.prepareProjectForBuild();
  });
  if (messages.hasMessages()) {
    Console.arrowError("Errors while adding packages:", 1);
    Console.printMessages(messages);
    catalogUtils.explainIfRefreshFailed();  // this is why we're not using captureAndExit
    return 1;
  }

  _.each(infoMessages, function (message) {
    Console.info(message);
  });
  projectContext.packageMapDelta.displayOnConsole();

  // Show descriptions of directly added packages.
  Console.info();
  for (const constraint of constraintsToAdd) {
    var version = projectContext.packageMap.getInfo(constraint.package).version;
    var versionRecord = await projectContext.projectCatalog.getVersion(
        constraint.package, version);
    var deprecatedMessage = "";
    if (versionRecord.deprecated) {
      if (versionRecord.deprecatedMessage) {
        deprecatedMessage = ` - DEPRECATED: ${versionRecord.deprecatedMessage}`
      } else {
        deprecatedMessage = ' - DEPRECATED';
      }
    }
    Console.info(
        constraint.package +
        (versionRecord.description ? (": " + versionRecord.description) : "") + deprecatedMessage
    );
  }

  return exitCode;
});


///////////////////////////////////////////////////////////////////////////////
// remove
///////////////////////////////////////////////////////////////////////////////
main.registerCommand({
  name: 'remove',
  options: {
    "allow-incompatible-update": { type: Boolean }
  },
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    allowIncompatibleUpdate: options["allow-incompatible-update"]
  });

  await main.captureAndExit("=> Errors while initializing project:", async function () {
    // We're just reading metadata here --- we're not going to resolve
    // constraints until after we've made our changes.
   return await projectContext.readProjectMetadata();
  });

  let exitCode = 0;

  // Split arguments into Cordova plugins and packages
  const { plugins: pluginsToRemove, packages }  =
    splitPluginsAndPackages(options.args);

  if (!_.isEmpty(pluginsToRemove)) {
    function cordovaPluginRemove() {
      const plugins = projectContext.cordovaPluginsFile.getPluginVersions();
      let changed = false;

      for (id of pluginsToRemove) {
        const newId = newPluginId(id);

        if (/@/.test(id)) {
          Console.error(`${id}: do not specify version constraints.`);
          exitCode = 1;
        } else if (_.has(plugins, id)) {
          delete plugins[id];
          Console.info(`Removed Cordova plugin ${id}.`);
          changed = true;
        } else if (newId && _.has(plugins, newId)) {
          delete plugins[newId];
          Console.info(`Removed Cordova plugin ${newId} \
  (plugin has been renamed as part of moving to npm).`);
          changed = true;
        } else {
          Console.error(`Cordova plugin ${id} is not in this project.`);
          exitCode = 1;
        }
      }

      changed && projectContext.cordovaPluginsFile.write(plugins);
    }

    await ensureDevBundleDependencies();
    cordovaPluginRemove();
  }

  if (_.isEmpty(packages)) {
    return exitCode;
  }

  // For each package name specified, check if we already have it and warn the
  // user. Because removing each package is a completely atomic operation that
  // has no chance of failure, this is just a warning message, it doesn't cause
  // us to stop.
  let packagesToRemove = [];
  _.each(packages, function (packageName) {
    if (/@/.test(packageName)) {
      Console.error(packageName + ": do not specify version constraints.");
      exitCode = 1;
    } else if (! projectContext.projectConstraintsFile.getConstraint(packageName)) {
      // Check that we are using the package. We don't check if the package
      // exists. You should be able to remove non-existent packages.
      Console.error(packageName  + " is not a direct dependency in this project.");
      exitCode = 1;
    } else {
      packagesToRemove.push(packageName);
    }
  });
  if (! packagesToRemove.length) {
    return exitCode;
  }

  // Remove the packages from the in-memory representation of .meteor/packages.
  projectContext.projectConstraintsFile.removePackages(packagesToRemove);

  // Run the constraint solver, rebuild local packages, etc. This will write
  // our changes to .meteor/packages if it succeeds.
  await main.captureAndExit("=> Errors after removing packages", function () {
    return projectContext.prepareProjectForBuild();
  });
  projectContext.packageMapDelta.displayOnConsole();

  // Log that we removed the constraints. It is possible that there are
  // constraints that we officially removed that the project still 'depends' on,
  // which is why we do this in addition to dislpaying the PackageMapDelta.
  _.each(packagesToRemove, function (packageName) {
    Console.info(packageName + ": removed dependency");
  });

  return exitCode;
});


///////////////////////////////////////////////////////////////////////////////
// refresh
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'refresh',
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, async function (options) {
  // We already did it!
  return 0;
});


///////////////////////////////////////////////////////////////////////////////
// admin
///////////////////////////////////////////////////////////////////////////////

// For admin commands, at least in preview0.90, we can be kind of lazy and not bother
// to pre-check if the command will succeed client-side. That's because we both
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
  },
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, async function (options) {
  var name = options.args[0];

  // Yay, checking that options are correct.
  if (options.add && options.remove) {
    Console.error(
      "Sorry, you can only add or remove one user at a time.");
    return 1;
  }
  if ((options.add || options.remove) && options.list) {
    Console.error(
      "Sorry, you can't change the users at the same time as you're",
      "listing them.");
    return 1;
  }

  // Now let's get down to business! Fetching the thing.
  var fullRecord = await getReleaseOrPackageRecord(name);
  var record = fullRecord.record;
  if (!options.list) {

    try {
      var conn = await packageClient.loggedInPackagesConnection();
    } catch (err) {
      packageClient.handlePackageServerConnectionError(err);
      return 1;
    }

    try {
      if (options.add) {
        Console.info("Adding a maintainer to " + name + "...");
        if (fullRecord.release) {
          await packageClient.callPackageServer(
            conn, 'addReleaseMaintainer', name, options.add);
        } else {
          await packageClient.callPackageServer(
            conn, 'addMaintainer', name, options.add);
        }
      } else if (options.remove) {
        Console.info("Removing a maintainer from " + name + "...");
        if (fullRecord.release) {
          await packageClient.callPackageServer(
            conn, 'removeReleaseMaintainer', name, options.remove);
        } else {
          await packageClient.callPackageServer(
            conn, 'removeMaintainer', name, options.remove);
        }
        Console.info("Success.");
      }
    } catch (err) {
      packageClient.handlePackageServerConnectionError(err);
      return 1;
    }
    conn.close();

    // Update the catalog so that we have this information, and find the record
    // again so that the message below is correct.
    await refreshOfficialCatalogOrDie();
    fullRecord = await getReleaseOrPackageRecord(name);
    record = fullRecord.record;
  }

  if (!record) {
    Console.info(
      "Could not get list of maintainers:",
      "package " + name + " does not exist.");
    return 1;
  }

  Console.info();
  Console.info("The maintainers for " + name + " are:");
  _.each(record.maintainers, function (user) {
    if (! user || !user.username) {
      Console.rawInfo("<unknown>" + "\n");
    } else {
      Console.rawInfo(user.username + "\n");
    }
  });
  return 0;
});

 ///////////////////////////////////////////////////////////////////////////////
// admin make-bootstrap-tarballs
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'admin make-bootstrap-tarballs',
  minArgs: 2,
  maxArgs: 2,
  hidden: true,

  options: {
    // Copy the tarball contents to the output directory instead of making a
    // tarball (useful for testing the release process)
    "unpacked": { type: Boolean },
    // Build a tarball only for a specific arch
    "target-arch": { type: String }
  },

  // In this function, we want to use the official catalog everywhere, because
  // we assume that all packages have been published (along with the release
  // obviously) and we want to be sure to only bundle the published versions.
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, async function (options) {
  var releaseNameAndVersion = options.args[0];

  // We get this as an argument, so it is an OS path. Make it a standard path.
  var outputDirectory = files.convertToStandardPath(options.args[1]);

  var trackAndVersion = catalogUtils.splitReleaseName(releaseNameAndVersion);
  var releaseTrack = trackAndVersion[0];
  var releaseVersion = trackAndVersion[1];

  var releaseRecord = await catalog.official.getReleaseVersion(
    releaseTrack, releaseVersion);
  if (!releaseRecord) {
    // XXX this could also mean package unknown.
    Console.error('Release unknown: ' + releaseNameAndVersion + '');
    return 1;
  }

  var toolPackageVersion = releaseRecord.tool &&
        utils.parsePackageAndVersion(releaseRecord.tool);
  if (!toolPackageVersion) {
    throw new Error("bad tool in release: " + releaseRecord.tool);
  }
  var toolPackage = toolPackageVersion.package;
  var toolVersion = toolPackageVersion.version;

  var toolPkgBuilds = await catalog.official.getAllBuilds(
    toolPackage, toolVersion);
  if (!toolPkgBuilds) {
    // XXX this could also mean package unknown.
    Console.error('Tool version unknown: ' + releaseRecord.tool);
    return 1;
  }
  if (!toolPkgBuilds.length) {
    Console.error('Tool version has no builds: ' + releaseRecord.tool);
    return 1;
  }

  // XXX check to make sure this is the three arches that we want? it's easier
  // during 0.9.0 development to allow it to just decide "ok, i just want to
  // build the OSX tarball" though.
  var buildArches = _.pluck(toolPkgBuilds, 'buildArchitectures');
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

  if (options['target-arch']) {
    // check if the passed arch is in the list
    var arch = options['target-arch'];
    if (! osArches.includes(arch)) {
	      throw new Error(
        arch + ": the arch is not available for the release. Available arches: "
        + osArches.join(', '));
    }

    // build only for the selected arch
    osArches = [arch];
  }

  Console.error(
    'Building bootstrap tarballs for architectures ' + osArches.join(', '));

  // Before downloading anything, check that the catalog contains everything we
  // need for the OSes that the tool is built for.
  await main.captureAndExit("=> Errors finding builds:", async function () {
    for (const osArch of osArches) {
      for (const [pkgName, pkgVersion] of Object.entries(releaseRecord.packages)) {
        await buildmessage.enterJob({
          title: "looking up " + pkgName + "@" + pkgVersion + " on " + osArch
        }, async function () {
          if (!(await catalog.official.getBuildsForArches(pkgName, pkgVersion, [osArch]))) {
            buildmessage.error("missing build of " + pkgName + "@" + pkgVersion +
                               " for " + osArch);
          }
        });
      }
    }
  });

  files.mkdir_p(outputDirectory);

  // Get a copy of the data.json.
  var dataTmpdir = files.mkdtemp();
  var tmpDataFile = files.pathJoin(dataTmpdir, 'packages.data.db');

  var tmpCatalog = new catalogRemote.RemoteCatalog();
  await tmpCatalog.initialize({
    packageStorage: tmpDataFile
  });
  try {
    await packageClient.updateServerPackageData(tmpCatalog, null);
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 2;
  }

  // Since we're making bootstrap tarballs, we intend to recommend this release,
  // so we should ensure that once it is downloaded, it knows it is recommended
  // rather than having a little identity crisis and thinking that a past
  // release is the latest recommended until it manages to sync.
  await tmpCatalog.forceRecommendRelease(releaseTrack, releaseVersion);
  await tmpCatalog.closePermanently();
  if (files.exists(tmpDataFile + '-wal')) {
    throw Error("Write-ahead log still exists for " + tmpDataFile
                + " so the data file will be incomplete!");
  }

  var packageMap =
        packageMapModule.PackageMap.fromReleaseVersion(releaseRecord);

  for (const osArch of osArches) {
    var tmpdir = files.mkdtemp();
    Console.info("Building tarball for " + osArch);

    // when building for Windows architectures, build Windows-specific
    // tropohouse and bootstrap tarball
    var targetPlatform;
    if (/win/i.test(osArch)) {
      targetPlatform = "win32";
    }

    // We're going to build and tar up a tropohouse in a temporary directory.
    var tmpTropo = new tropohouse.Tropohouse(
      files.pathJoin(tmpdir, '.meteor'),
      { platform: targetPlatform });

    await main.captureAndExit(
      "=> Errors downloading packages for " + osArch + ":",
      async function () {
        await tmpTropo.downloadPackagesMissingFromMap(packageMap, {
          serverArchitectures: [osArch],
        });
      }
    );

    // Install the sqlite DB file we synced earlier. We have previously
    // confirmed that the "-wal" file (which could contain extra log entries
    // that haven't been flushed to the main file yet) doesn't exist, so we
    // don't have to copy it.
    files.copyFile(tmpDataFile, config.getPackageStorage({
      root: tmpTropo.root
    }));

    // Create the top-level 'meteor' symlink, which links to the latest tool's
    // meteor shell script.
    var toolIsopackPath =
          tmpTropo.packagePath(toolPackage, toolVersion);
    var toolIsopack = new isopack.Isopack;
    await toolIsopack.initFromPath(toolPackage, toolIsopackPath);
    var toolRecord = _.findWhere(toolIsopack.toolsOnDisk, {arch: osArch});
    if (!toolRecord) {
      throw Error("missing tool for " + osArch);
    }

    await tmpTropo.linkToLatestMeteor(files.pathJoin(
        tmpTropo.packagePath(toolPackage, toolVersion, true),
        toolRecord.path,
        'meteor'));

    if (options.unpacked) {
      await files.cp_r(tmpTropo.root, outputDirectory);
    } else {
      await files.createTarball(
        tmpTropo.root,
        files.pathJoin(outputDirectory,
          'meteor-bootstrap-' + osArch + '.tar.gz'));
    }
  }

  return 0;
});

// We will document how to set banners on things in a later release.
main.registerCommand({
  name: 'admin set-banners',
  minArgs: 1,
  maxArgs: 1,
  hidden: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, async function (options) {
  var bannersFile = options.args[0];
  try {
    var bannersData = files.readFile(bannersFile, 'utf8');
    bannersData = JSON.parse(bannersData);
  } catch (e) {
    Console.error("Could not parse banners file: " + e.message);
    return 1;
  }
  if (!bannersData.track) {
    Console.error("Banners file should have a 'track' key.");
    return 1;
  }
  if (!bannersData.banners) {
    Console.error("Banners file should have a 'banners' key.");
    return 1;
  }

  try {
    var conn = await packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    await packageClient.callPackageServer(
      conn, 'setBannersOnReleases',
      bannersData.track, bannersData.banners);
  } catch (e) {
    packageClient.handlePackageServerConnectionError(e);
    return 1;
  }

  // Refresh afterwards.
  await refreshOfficialCatalogOrDie();
  return 0;
});

main.registerCommand({
  name: 'admin recommend-release',
  minArgs: 1,
  maxArgs: 1,
  options: {
    unrecommend: { type: Boolean, short: "u" }
  },
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, async function (options) {

  // We want the most recent information.
  //refreshOfficialCatalogOrDie();
  var release = options.args[0].split('@');
  var name = release[0];
  var version = release[1];
  if (!version) {
    Console.error('Must specify release version (track@version)');
    return 1;
  }

  // Now let's get down to business! Fetching the thing.
  var record = await catalog.official.getReleaseTrack(name);
  if (!record) {
    Console.error();
    Console.error('There is no release track named ' + name);
    return 1;
  }

  try {
    var conn = await packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    if (options.unrecommend) {
      Console.info("Unrecommending " + name + "@" + version + "...");
      await packageClient.callPackageServer(
        conn, 'unrecommendVersion', name, version);
      Console.info("Success.");
      Console.info(name + "@" + version, "is no longer a recommended release");
    } else {
      Console.info("Recommending " + options.args[0] + "...");
      await packageClient.callPackageServer(conn, 'recommendVersion', name, version);
      Console.info("Success.");
      Console.info(name + "@" + version, "is now a recommended release");
    }
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  await conn.close();
  await refreshOfficialCatalogOrDie();

  return 0;
});


main.registerCommand({
  name: 'admin change-homepage',
  minArgs: 2,
  maxArgs: 2,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, async function (options) {

  // We want the most recent information.
  //refreshOfficialCatalogOrDie();
  var name = options.args[0];
  var url = options.args[1];

  // Now let's get down to business! Fetching the thing.
  var record = await catalog.official.getPackage(name);
  if (!record) {
    Console.error();
    Console.error('There is no package named ' + name);
    return 1;
  }

  try {
    var conn = await packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    Console.rawInfo(
        "Changing homepage on "
          + name + " to " + url + "...\n");
      await packageClient.callPackageServer(conn,
        '_changePackageHomepage', name, url);
      Console.info(" done");
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  await conn.close();
  await refreshOfficialCatalogOrDie();

  return 0;
});


main.registerCommand({
  name: 'admin set-unmigrated',
  minArgs: 1,
  options: {
    "success" : {type: Boolean}
  },
  hidden: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, async function (options) {

  // We don't care about having the most recent information, but we do want the
  // option to either unmigrate a specific version, or to unmigrate an entire
  // package. So, for an entire package, let's get all of its versions.
  var name = options.args[0];
  var versions = [];
  var nSplit = name.split('@');
  if (nSplit.length > 2) {
    throw new main.ShowUsage;
  } else if (nSplit.length == 2) {
    versions = [nSplit[1]];
    name = nSplit[0];
  } else {
    versions = await catalog.official.getSortedVersions(name);
  }

  try {
    var conn = await packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    var status = options.success ? "successfully" : "unsuccessfully";
    // XXX: This should probably use progress bars instead.
    for (const version of versions) {
      Console.rawInfo(
        "Setting " + name + "@" + version + " as " +
         status + " migrated ...\n");
      await packageClient.callPackageServer(
        conn,
        '_changeVersionMigrationStatus',
        name, version, !options.success);
      Console.info("done.");
    }
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  conn.close();
  await refreshOfficialCatalogOrDie();

  return 0;
});
