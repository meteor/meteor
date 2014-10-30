var main = require('./main.js');
var path = require('path');
var _ = require('underscore');
var fs = require("fs");
var files = require('./files.js');
var deploy = require('./deploy.js');
var buildmessage = require('./buildmessage.js');
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
var PackageSource = require('./package-source.js');
var compiler = require('./compiler.js');
var catalog = require('./catalog.js');
var catalogRemote = require('./catalog-remote.js');
var stats = require('./stats.js');
var isopack = require('./isopack.js');
var cordova = require('./commands-cordova.js');
var packageLoader = require('./package-loader.js');
var Console = require('./console.js').Console;

// On some informational actions, we only refresh the package catalog if it is > 15 minutes old
DEFAULT_MAX_AGE = 15 * 60 * 1000;

// Returns an object with keys:
//  record : (a package or version record)
//  release : true if it is a release instead of a package.
var getReleaseOrPackageRecord = function(name) {
  // Too lazy to do string parsing.
  var rec = catalog.official.getPackage(name);
  var rel = false;
  if (!rec) {
    // Not a package! But is it a release track?
    rec = catalog.official.getReleaseTrack(name);
    if (rec)
      rel = true;
  }
  return { record: rec, isRelease: rel };
};

// Seriously, this dies if it can't refresh. Only call it if you're sure you're
// OK that the command doesn't work while offline.
var doOrDie = exports.doOrDie = function (options, f) {
  if (_.isFunction(options)) {
    f = options;
    options = {};
  }
  options = options || {};
  var ret;
  var messages = buildmessage.capture(options, function () {
    ret = f();
  });
  if (messages.hasMessages()) {
    Console.printMessages(messages);
    throw new main.ExitWithCode(1);
  }
  return ret;
};

var refreshOfficialCatalogOrDie = function (options) {
  if (!catalog.refreshOrWarn(options)) {
    Console.error(
      "This command requires an up-to-date package catalog. Exiting.");
    throw new main.ExitWithCode(1);
  }
};

var explainIfRefreshFailed = function () {
  if (catalog.official.offline || catalog.refreshFailed) {
    Console.info("Your package catalog may be out of date.\n" +
      "Please connect to the internet and try again.");
  }
};

// XXX: To formatters.js ?
var formatAsList = function (list, options) {
  options = options || {};
  var formatter = options.formatter;
  if (!list || !list.length) {
    return "";
  }
  var out = "";
  for (var i = 0; i < list.length; i++) {
    if (i != 0) {
      out += ", ";
    }
    var v = list[i];
    if (formatter) {
      v = formatter(v);
    }
    out += v;
  }
  return out;
};

var endsWith = function (s, suffix) {
  return s.length >= suffix.length && s.substr(s.length - suffix.length) == suffix;
};

var removeIfEndsWith = function (s, suffix) {
  if (!endsWith(s, suffix)) {
    return s;
  }
  return s.substring(0, s.length - suffix.length);
};

var formatArchitecture = function (s) {
  while (true) {
    var original = s;

    // Remove well-known suffixes
    s = removeIfEndsWith(s, "+web.cordova");
    s = removeIfEndsWith(s, "+web.browser");

    if (original === s) {
      return s;
    }
  }
};

// Internal use only. Makes sure that your Meteor install is totally good to go
// (is "airplane safe"). Specifically, it:
//    - Builds all local packages (including their npm dependencies)
//    - Ensures that all packages in your current release are downloaded
//    - Ensures that all packages used by your app (if any) are downloaded
// (It also ensures you have the dev bundle downloaded, just like every command
// in a checkout.)
//
// The use case is, for example, cloning an app from github, running this
// command, then getting on an airplane.
//
// This does NOT guarantee a *re*build of all local packages (though it will
// download any new dependencies). If you want to rebuild all local packages,
// call meteor rebuild. That said, rebuild should only be necessary if there's a
// bug in the build tool... otherwise, packages should be rebuilt whenever
// necessary!
main.registerCommand({
  name: '--get-ready',
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {
  // It is not strictly needed, but it is thematically a good idea to refresh
  // the official catalog when we call get-ready, since it is an
  // internet-requiring action.
  //refreshOfficialCatalogOrDie();

  var loadPackages = function (packagesToLoad, loader) {
    buildmessage.assertInCapture();
    loader.downloadMissingPackages();
    _.each(packagesToLoad, function (name) {
      // Calling getPackage on the loader will return a isopack object, which
      // means that the package will be compiled/downloaded. That we throw the
      // package variable away afterwards is immaterial.
      loader.getPackage(name);
    });
  };

  var messages = buildmessage.capture({
    title: 'Getting packages ready'
  }, function () {
    // First, build all accessible *local* packages, whether or not this app
    // uses them.  Use the "all packages are local" loader.
    loadPackages(catalog.complete.getLocalPackageNames(),
                 new packageLoader.PackageLoader({versions: null,
                                                  catalog: catalog.complete}));

    // In an app? Get the list of packages used by this app. Calling getVersions
    // on the project will ensureDepsUpToDate which will ensure that all builds
    // of everything we need from versions have been downloaded. (Calling
    // buildPackages may be redundant, but can't hurt.)
    if (options.appDir) {
      loadPackages(_.keys(project.getVersions()), project.getPackageLoader());
    }

    // Using a release? Get all the packages in the release.
    if (release.current.isProperRelease()) {
      var releasePackages = release.current.getPackages();
      loadPackages(
        _.keys(releasePackages),
        new packageLoader.PackageLoader({versions: releasePackages,
                                         catalog: catalog.complete}));
    }
  });
  if (messages.hasMessages()) {
    Console.printMessages(messages);
    return 1;
  };

  Console.info("You are ready!");
  return 0;
});


///////////////////////////////////////////////////////////////////////////////
// publish a package
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'publish',
  pretty: true,
  minArgs: 0,
  maxArgs: 0,
  options: {
    create: { type: Boolean },
    // This is similar to publish-for-arch, but uses the source code you have
    // locally (and other local packages you may have) instead of downloading
    // the source bundle. It does verify that the source is the same, though.
    // Good for bootstrapping things in the core release.
    'existing-version': { type: Boolean },
    // This is the equivalent of "sudo": make sure that administrators don't
    // accidentally put their personal packages in the top level namespace.
    'top-level': { type: Boolean }
  },
  requiresPackage: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {
  if (options.create && options['existing-version']) {
    // Make up your mind!
    Console.error("The --create and --existing-version options cannot " +
                         "both be specified.");
    return 1;
  }

  // Refresh the catalog, caching the remote package data on the server. We can
  // optimize the workflow by using this data to weed out obviously incorrect
  // submissions before they ever hit the wire.
  //refreshOfficialCatalogOrDie();

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  if (! conn) {
    Console.error('No connection: Publish failed.');
    return 1;
  }

  Console.info('Reading package...');

  // XXX Prettify error messages

  var packageSource, compileResult;
  var messages = buildmessage.capture(
    { title: "Building the package" },
    function () {

      packageSource = new PackageSource(catalog.complete);

      // Anything published to the server must have a version.
      packageSource.initFromPackageDir(options.packageDir, {
        requireVersion: true });
      if (buildmessage.jobHasMessages())
        return; // already have errors, so skip the build

      var deps =
          compiler.determineBuildTimeDependencies(packageSource)
            .packageDependencies;
      tropohouse.default.downloadMissingPackages(deps);

      compileResult = compiler.compile(packageSource, { officialBuild: true });
    });

  if (messages.hasMessages()) {
    Console.printMessages(messages);
    return 1;
  }

  var packageName = packageSource.name;

  // Fail early if the package record exists, but we don't think that it does
  // and are passing in the --create flag!
  if (options.create) {
    var packageInfo = catalog.official.getPackage(packageName);
    if (packageInfo) {
      Console.error(
        "Package already exists. To create a new version of an existing "+
        "package, do not use the --create flag!");
      return 2;
    }

    if (!options['top-level'] && !packageName.match(/:/)) {
      Console.error(
"Only administrators can create top-level packages without an account prefix.\n" +
"(To confirm that you wish to create a top-level package with no account\n" +
"prefix, please run this command again with the --top-level option.)");

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
  };

  // We have initialized everything, so perform the publish oepration.
  var binary = compileResult.isopack.platformSpecific();
  var ec;  // XXX maybe combine with messages?
  try {
    messages = buildmessage.capture({
      title: "Publishing the package"
    }, function () {
      ec = packageClient.publishPackage(
        packageSource, compileResult, conn, {
          new: options.create,
          existingVersion: options['existing-version'],
          doNotPublishBuild: binary && !options['existing-version']
        });
    });
  } catch (e) {
    packageClient.handlePackageServerConnectionError(e);
    return 1;
  }
  if (messages.hasMessages()) {
    Console.printMessages(messages);
    return ec || 1;
  }

  // We are only publishing one package, so we should close the connection, and
  // then exit with the previous error code.
  conn.close();

  // If the publishPackage failed, exit now (no need to spend time trying to
  // refresh).
  if (ec)
    return ec;

  // Warn the user if their package is not good for all architectures.
  if (binary && options['existing-version']) {
    // This is an undocumented command that you are not supposed to run! We
    // assume that you know what you are doing, if you ran it, and are OK with
    // overrwriting normal compatibilities.
    Console.warn("\nWARNING: Your package contains binary code.");
  } else if (binary) {
    // Normal publish flow. Tell the user nicely.
    Console.warn(
"\nThis package contains binary code and must be built on multiple architectures.\n");

    Console.info(
"You can access Meteor provided build machines, pre-configured to support\n" +
"older versions of MacOS and Linux, by running:\n");

    _.each(["os.osx.x86_64", "os.linux.x86_64", "os.linux.x86_32"], function (a) {
      Console.info("  meteor admin get-machine", a);
    });

    Console.info("\nOn each machine, run:\n");

    Console.info("  meteor",
                 "publish-for-arch",
                 packageSource.name + "@" + packageSource.version);

    Console.info("\nFor more information on binary ABIs and consistent builds, see:");
    Console.info("  https://github.com/meteor/meteor/wiki/Build-Machines\n");
  }

  // Refresh, so that we actually learn about the thing we just published.
  refreshOfficialCatalogOrDie();

  return ec;
});


main.registerCommand({
  name: 'publish-for-arch',
  minArgs: 1,
  maxArgs: 1,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {
  // argument processing
  var all = options.args[0].split('@');
  if (all.length !== 2) {
    Console.error(
      'Incorrect argument. Please use the form of <packageName>@<version>');
    throw new main.ShowUsage;
  }
  var name = all[0];
  var versionString = all[1];

  // Refresh the catalog, cacheing the remote package data on the server.
  //refreshOfficialCatalogOrDie();

  var packageInfo = doOrDie(function () {
    return catalog.complete.getPackage(name);
  });
  if (! packageInfo) {
    Console.error(
"You can't call `meteor publish-for-arch` on package '" + name + "' without\n" +
"publishing it first.\n\n" +
"To publish the package, run `meteor publish --create` from the package directory.\n");

    return 1;
  }
  var pkgVersion = catalog.official.getVersion(name, versionString);
  if (! pkgVersion) {
    Console.error(
"You can't call `meteor publish-for-arch` on version " + versionString + " of\n" +
"package '" + name + "' without publishing it first.\n\n" +
"To publish the version, run `meteor publish` from the package directory.\n\n");

    return 1;
  }

  if (! pkgVersion.source || ! pkgVersion.source.url) {
    Console.error('There is no source uploaded for ' +
                         name + '@' + versionString);
    return 1;
  }

  var sourceTarball = httpHelpers.getUrl({
    url: pkgVersion.source.url,
    encoding: null
  });
  var sourcePath = files.mkdtemp(name + '-' +
                                 versionString + '-source-');
  // XXX check tarballHash!
  files.extractTarGz(sourceTarball, sourcePath);

  // XXX Factor out with packageClient.bundleSource so that we don't
  // have knowledge of the tarball structure in two places.
  var packageDir = path.join(sourcePath, name);

  if (! fs.existsSync(packageDir)) {
    Console.error('Malformed source tarball');
    return 1;
  }

  var isopk;
  var messages = buildmessage.capture({
    title: "Building package " + name
  }, function () {
    var packageSource = new PackageSource(catalog.complete);

    // This package source, although it is initialized from a directory is
    // immutable. It should be built exactly as is. If we need to modify
    // anything, such as the version lock file, something has gone terribly
    // wrong and we should throw. Additionally, we know exactly which package
    // we are trying to publish-for-arch, so let's pass in the name.
    packageSource.initFromPackageDir(packageDir,  {
      requireVersion: true,
      immutable: true,
      name: name
    });
    if (buildmessage.jobHasMessages())
      return;

    var versionLock = packageSource.dependencyVersions;
    //If we don't have a valid version lock file, that's weird! Maybe we are a
    //core package, which don't have version files. Anyway, we should not use
    //publish-for-arch in this case.
    if (!versionLock || !versionLock.toolVersion) {
      process.stderr.write(
"This package has no valid version lock file: are you trying to use publish-for-arch on\n" +
"a core package? Publish-for-arch cannot guarantee safety. Please use\n" +
"publish --existing-version instead.\n");
      process.exit(1);
    }

    // Let's separate out the tool, if we can. If we can't, thats super bad, but
    // hopefully will not happen.
    var oldTool = versionLock.toolVersion.split('@');
    if (oldTool.length !== 2) {
      process.stderr.write(
"The version lock file on this package specifies an invalid meteor tool. That's weird.\n" +
"Publish-for-arch cannot guarantee safety with a corrupted version lock file! You can use\n" +
"publish --existing-version to try to get around this?\n");
      process.exit(1);
    }

    var toolPackage = oldTool[0];
    var toolVersion = oldTool[1];
    if (toolVersion === "CHECKOUT" &&
        !files.inCheckout()) {
      process.stderr.write(
"This package was published from a checkout of meteor! The tool cannot replicate\n" +
"that environment and will not even try. Please checkout meteor at the \n" +
"corresponding git commit and try again.\n");
      process.exit(1);
    }

    if (toolVersion !== "CHECKOUT") {
      if (files.inCheckout()) {
        // The code running here, is probably not what you think it is. You
        // might think that you are running from checkout, but we are going to
        // springboard into a built release that is not running the code that
        // you just wrote. That's super confusing, so we are not going to do
        // that. If you ever find yourself doing this... well, you are running
        // from checkout, so you can figure it out.
        process.stderr.write(
          "This package was published from a built version of meteor," +
            "but you are running from checkout!\nConsider running from a " +
            "proper Meteor release, so we can springboard correctly.\n");
        process.stderr.exit(1);
      }
      var currentToolPackage = release.current.getToolsPackage();
      var currentToolVersion = release.current.getToolsVersion();
      if (currentToolPackage !== toolPackage ||
          currentToolVersion !== toolVersion) {
        // XXX: OK. Here is the story.
        //
        // Meteor does not have a concept of not running from release. That is,
        // it runs from a release, or from checkout, not from a stand-alone
        // tool. We don't record the release that we publish with in
        // publish-for-arch, because that doesn't make sense. However, we can't
        // just springboard to a tool, because, for now, in 0.9.3, we really
        // want this to work on packages published pre-0.9.3. Just putting in
        // springboarding to tool code is not going to work, because older
        // versions of Meteor will just try to spingboard anyway.
        //
        // This is kind of a transitional hack. Going forward, there are several
        // ways to fix this -- we could introduct some sort of local records (so
        // we could create a temporary release record and run meteor from
        // there), or we can teach meteor to just run from a tool, instead of a
        // release. I like the latter better from a conceptual standpoint (why
        // should we run from a release only?) but it doesn't have a lot of use
        // cases. Alternatively, we can learn to simulate a release for older
        // versions, and not for newer versions, or something. This will be
        // worth thinking about when we have more information on how the system
        // is set up and used.
        //
        // Now, a proof of correctness -- this relies on several things:
        //
        // 1. We only use the tool in order to publish. Other release
        // information is irrelevant. (If that's ever false, we should write the
        // release instead of the tool and save us the trouble)
        //
        // 2. Springboarding to a specific release will run the tool from that
        // release, and not end up springboarding us to a different
        // release. Even if there are patches for this release (or whatever), we
        // are going to run the tool version of the release that we select here.
        //
        // 3. The only way to run a tool currently is from a release --
        // otherwise, we wouldn't need this explanation. (There is no way to
        // remove a release from existence.) Ergo, there must be a release that
        // contains a given tool, that we first used to publish this package.
        //
        // From 1 & 2, we get the idea that any release with the valid tool
        // version will do. From 3, we know that such a release exists.
        //
        // XXX Once again, this is a hack. Various things could happen to change
        // the above-mentioned points. When they do happen, in the not-so-near
        // future, we will have more information on how to actually solve this
        // problem.
        var sufficientlyReasonableReleaseVersion =
          catalog.official.getReleaseWithTool(versionLock.toolVersion);
        throw new
          main.SpringboardToSpecificRelease(sufficientlyReasonableReleaseVersion);
      }
    }

    // Now compile it! Once again, everything should compile, and if
    // it doesn't we should fail. Hopefully, of course, we have
    // tested our stuff before deciding to publish it to the package
    // server, but we need to be careful.
    // XXX If you're not using a matching version of the tool, this will give
    //     an error like "Version lock for FOO should never change"!  Including
    //     if you've swapped between checkout and released tool.  We really
    //     should springboard here...
    var deps =
          compiler.determineBuildTimeDependencies(packageSource).packageDependencies;
    tropohouse.default.downloadMissingPackages(deps);

    isopk = compiler.compile(packageSource, {
      officialBuild: true
    }).isopack;
    if (buildmessage.jobHasMessages())
      return;
  });

  if (messages.hasMessages()) {
    Console.printMessages(messages);
    return 1;
  }

  var conn;
  try {
    conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    messages = buildmessage.capture({
      title: "Publishing package " + name
    }, function () {
      packageClient.createAndPublishBuiltPackage(conn, isopk);
    });
  } catch (e) {
    packageClient.handlePackageServerConnectionError(e);
    return 1;
  }

  if (messages.hasMessages()) {
    Console.printMessages(messages);
    return 1;
  }

  refreshOfficialCatalogOrDie();
  return 0;
});

main.registerCommand({
  name: 'publish-release',
  minArgs: 1,
  maxArgs: 1,
  options: {
    'create-track': { type: Boolean, required: false },
    'from-checkout': { type: Boolean, required: false }
  },
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {
  // Refresh the catalog, cacheing the remote package data on the server.
  //Console.info("Resyncing with package server...");
  //refreshOfficialCatalogOrDie();

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
    Console.error("Could not parse release file: " + e.message);
    return 1;
  }

  // Fill in the order key and any other generated release.json fields.
  Console.info("Double-checking release schema .");

  // Check that the schema is valid -- release.json contains all the required
  // fields, does not contain contradicting information, etc. Output all
  // messages, so the user can fix all errors at once.
  // XXX: Check for unknown keys.
  var badSchema = false;
  var bad = function (message) {
    if (!badSchema)
      Console.error("");
    Console.error(message);
    badSchema = true;
  };
  if (!_.has(relConf, 'track')) {
    bad("Configuration file must specify release track. (track).");
  }
  if (!_.has(relConf, 'version')) {
    bad("Configuration file must specify release version. (version).");
  }
  if (!_.has(relConf, 'description')) {
    bad("Configuration file must contain a description (description).");
  } else if (relConf['description'].length > 100) {
    bad("Description must be under 100 characters.");
  }
  if (!options['from-checkout']) {
    if (!_.has(relConf, 'tool')) {
      bad("Configuration file must specify a tool version (tool) unless in --from-checkout mode.");
    }
    if (!_.has(relConf, 'packages')) {
      bad("Configuration file must specify package versions (packages) unless in --from-checkout mode.");
    }
  }

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

  if (!_.has(relConf, 'orderKey') && relConf['recommended']) {
    bad("Recommended releases must have order keys.");
  }
  // On the main release track, we can't name the release anything beginning
  // with 0.8 and below, because those are taken for pre-troposphere releases.
  if ((relConf.track === catalog.DEFAULT_TRACK)) {
    var start = relConf.version.slice(0,4);
    if (start === "0.8." || start === "0.7." ||
        start === "0.6." || start === "0.5.") {
      bad(
        "It looks like you are trying to publish a pre-package-server meteor release.\n" +
          "Doing this through the package server is going to cause a lot of confusion.\n" +
          "Please use the old release process.");
    }
  }
  if (badSchema) {
    return 1;
  }
  Console.info(".");

  // Let's check if this is a known release track/ a track to which we are
  // authorized to publish before we do any complicated/long operations, and
  // before we publish its packages.
  if (!options['create-track']) {
    var trackRecord = catalog.official.getReleaseTrack(relConf.track);
    if (!trackRecord) {
      Console.error('\n There is no release track named ' + relConf.track +
                           '. If you are creating a new track, use the --create-track flag.');
      return 1;
    }

    // We are going to call the server to check if we are authorized, so that when
    // we implement things like organizations, we are not handicapped by the
    // user's meteor version.
    if (!packageClient.amIAuthorized(relConf.track,conn,  true)) {
      Console.error('\n You are not an authorized maintainer of ' + relConf.track + ".");
      Console.error('Only authorized maintainers may publish new versions.');
      return 1;
    };
  }

  // XXX: Messages that start with . :-(
  Console.info(". OK!");

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
      Console.error("Must run from checkout to make release from checkout.");
      return 1;
    };

    // We are going to disable publishing a release from checkout and an appDir,
    // just to be extra safe about local packages. There is never a good reason
    // why you would do that, and maybe you are confused about what you are
    // trying to do.
    if (options.appDir) {
      Console.error("Trying to publish from checkout while in an application " +
                           "directory is a bad idea." +
                           " Please try again from somewhere else.");
      return 1;
    }

    // You should not use a release configuration with packages&tool *and* a
    // from checkout option, at least for now. That's potentially confusing
    // (which ones did you mean to use) and makes it likely that you did one of
    // these by accident. So, we will disallow it for now.
    if (relConf.packages || relConf.tool) {
      Console.error(
        "Setting the --from-checkout option will use the tool and packages in your meteor " +
          "checkout.\n" +
          "Your release configuration file should not contain that information.");
      return 1;
    }

    // Now, let's collect all the packages in our meteor/packages directory. We
    // are going to be extra-careful to publish only those packages, and not
    // just all local packages -- we might be running this from an app
    // directory, though we really shouldn't be, or, if we ever restructure the
    // way that we store packages in the meteor directory, we should be sure to
    // reevaluate what this command actually does.
    var localPackageDir = path.join(files.getCurrentToolsDir(), "packages");
    var contents = fs.readdirSync(localPackageDir);
    var myPackages = {};
    var toPublish = {};
    var canBuild = true;
    var messages = buildmessage.capture(
      {title: "Rebuilding local packages"},
      function () {
        Console.info("Rebuilding local packages...");
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
          // contains 'package.js'. (We used to support isopacks in
          // localPackageDirs, but no longer.)
          if (fs.existsSync(path.join(packageDir, 'package.js'))) {
            var packageSource = new PackageSource(catalog.complete);
            buildmessage.enterJob(
              { title: "Building package " + item },
              function () {
                Console.info("  checking consistency of " + item + " ");

                // Initialize the package source. Core packages have the same
                // name as their corresponding directories, because otherwise we
                // would have a lot of difficulties trying to keep them
                // organized.
                // (XXX: this is a flimsy excuse, ekate, just fix the code)
                packageSource.initFromPackageDir(packageDir,  {
                  requireVersion: true,
                  name: item });

                if (buildmessage.jobHasMessages()) {
                  Console.warn("\n ...Error reading package:" + item);
                  canBuild = false;
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

                // Now compile it! Once again, everything should compile, and if
                // it doesn't we should fail. Hopefully, of course, we have
                // tested our stuff before deciding to publish it to the package
                // server, but we need to be careful.
                var directDeps =
                      compiler.determineBuildTimeDependencies(packageSource).directDependencies;
                tropohouse.default.downloadMissingPackages(directDeps);
                var compileResult = compiler.compile(packageSource,
                                                     { officialBuild: true });
                if (buildmessage.jobHasMessages()) {
                  Console.warn("\n ... Error compiling isopack: " + item );
                  canBuild = false;
                  return;
                };

                // Let's get the server version that this local package is
                // overwriting. If such a version exists, we will need to make sure
                // that the contents are the same.
                var oldVersion = catalog.official.getVersion
                (item, packageSource.version);

                // Include this package in our release.
                myPackages[item] = packageSource.version;

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
                    Console.warn("NOT OK unofficial");
                    return;
                  }
                  toPublish[item] = {source: packageSource,
                                     compileResult: compileResult};
                  Console.info("new package or version");
                  return;
                } else {
                  // If we can't build some of our packages, then we care about
                  // that far more than we care about hash conflicts (and fixing
                  // the errors will change the hashes as well). Don't even
                  // bother checking until that happens.
                  if (!canBuild) {
                    Console.info("hash comparison skipped");
                    return;
                  }

                  var existingBuild =
                        catalog.official.getBuildWithPreciseBuildArchitectures(
                          oldVersion,
                          compileResult.isopack.buildArchitectures());

                  // If the version number mentioned in package.js exists, but
                  // there's no build of this architecture, then either the old
                  // version was only semi-published, or you've added some
                  // platform-specific dependencies but haven't bumped the
                  // version number yet; either way, you should probably bump
                  // the version number.
                  var somethingChanged = !existingBuild;

                  if (!somethingChanged) {
                    // Save the isopack, just to get its hash.
                    // XXX this is redundant with the bundle build step that
                    // publishPackage will do later
                    var bundleBuildResult = packageClient.bundleBuild(
                      compileResult.isopack);
                    if (bundleBuildResult.treeHash !==
                        existingBuild.build.treeHash) {
                      somethingChanged = true;
                    }
                  }

                  if (somethingChanged) {
                    item = item + "@" + compileResult.isopack.version;
                    // The build ID of the old server record is not the same as
                    // the buildID that we have on disk. This means something
                    // has changed -- maybe our source files, or a buildId of
                    // one of our build-time dependencies. There might be a
                    // false positive here (for example, we added some comments
                    // to a package.js file somewhere), but, for now, we would
                    // rather err on the side of catching this issue and forcing
                    // a more thorough check.
                    buildmessage.error("Something changed in package " + item
                                       + ". Please upgrade version number.");
                    Console.error("  NOT OK");
                  } else {
                    Console.info("   ok");
                  }
                }
              });
          }
        });
      });

    if (messages.hasMessages()) {
      Console.printMessages(messages);
      return 1;
    };

    // We now have an object of packages that have new versions on disk that
    // don't exist in the server catalog. Publish them.
    var unfinishedBuilds = {};
    for (var name in toPublish) {  // don't use _.each so we can return
      if (!_.has(toPublish, name))
        continue;
      var prebuilt = toPublish[name];

      Console.info("Publishing package: " + name);

      // XXX merge with messages? having THREE kinds of error handling here is
      // um something.
      var pubEC;
      try {
        messages = buildmessage.capture({
          title: "Publishing package " + name
        }, function () {
          var binary =  prebuilt.compileResult.isopack.platformSpecific();

          var opts = {
            new: !catalog.official.getPackage(name),
            doNotPublishBuild: binary
          };

          // If we are creating a new package, dsPS will document this for us,
          // so we don't need to do this here. Though, in the future, once we
          // are done bootstrapping package servers, we should consider having
          // some extra checks around this.
          pubEC = packageClient.publishPackage(
            prebuilt.source,
            prebuilt.compileResult,
            conn,
            opts);

          if (binary) {
            unfinishedBuilds[name] = prebuilt.source.version;
          }
        });
      } catch (e) {
          packageClient.handlePackageServerConnectionError(e);
          return 1;
      }
      if (messages.hasMessages()) {
        Console.printMessages(messages);
        return pubEC || 1;
      }

      // If we fail to publish, just exit outright, something has gone wrong.
      if (pubEC > 0) {
        Console.error("Failed to publish: " + name);
        return pubEC;
      }
    }

    // Set the remaining release information. For now, when we publish from
    // checkout, we always set the meteor tool as the tool. We don't include the
    // tool in the packages list.
    relConf.tool="meteor-tool@" + myPackages["meteor-tool"];
    delete myPackages["meteor-tool"];
    relConf.packages=myPackages;
  }

  // Create the new track, if we have been told to.
  if (options['create-track']) {
    Console.info("Creating a new release track...");
    try {
      var track = conn.call('createReleaseTrack',
                            { name: relConf.track } );
    } catch (e) {
      packageClient.handlePackageServerConnectionError(e);
      return 1;
    }
  }

  Console.info("Creating a new release version...");
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
  try {
    if (!relConf.patchFrom) {
      uploadInfo = packageClient.callPackageServer(
        conn, 'createReleaseVersion', record);
    } else {
      uploadInfo = packageClient.callPackageServer(
        conn, 'createPatchReleaseVersion', record, relConf.patchFrom);
    }
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  // Get it back.
  refreshOfficialCatalogOrDie();
  Console.info("Done creating " + relConf.track  + "@" +
                       relConf.version + "!");

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
      files.runGitInCheckout('tag', gitTag);
      var fail = false;
      try {
        Console.info(
          "Pushing git tag (this should fail if you are not from MDG)");
        files.runGitInCheckout('push', 'git@github.com:meteor/meteor.git',
                             'refs/tags/' + gitTag);
      } catch (err) {
        Console.error(
          "Failed to push git tag. Please push git tag manually!");
        Console.error(
          "If you are publishing a non-prerelease version, then the readme will show up " +
          "in atmosphere. To make sure that happens, after pushing the git tag, please " +
          "run the following:");
        _.each(toPublish, function (pack, name) {
          Console.info("meteor admin set-latest-readme " + name + " --tag " + gitTag);
        });
        Console.error("If you are publishing an experimental version, don't worry about it.");
        fail = true;
      }
      if (!fail) {
        _.each(toPublish, function (pack, name) {
          var url = "https://raw.githubusercontent.com/meteor/meteor/" + gitTag +
                "/packages/" +
                name + "/README.md";
          var version = pack.compileResult.isopack.version;
          packageClient.callPackageServer(
            conn, '_changeReadmeURL', name,  version, url);
          Console.info("Setting the readme of", name + "@" + version, "to", url);
        });
      }
    }
  }

  // We need to warn the user that we didn't publish some of their
  // packages. Unlike publish, this is advanced functionality, so the user
  // should be familiar with the concept.
  if (!_.isEmpty(unfinishedBuilds)) {
    Console.warning(
      "WARNING: Some packages contain binary dependencies.");
    Console.warning("Builds have not been published for the following packages:");
    _.each(unfinishedBuilds, function (version, name) {
      Console.warning(name + "@" + version);
    });
    // Note: we don't actually enforce the proper build machine thing. You can't
    // use publish-for-arch for meteor-tool, for example, you need to use
    // publish --existing-version and to do it from checkout. Setting that up on
    // a build machine for a one-off experimental release could be a pain. In
    // that case, I guess, you can just run publish --existing-version:
    // presumably you don't care about compatibility etc. If it is an official
    // release, you ought to use a build machine though.
    Console.warning(
      "Please publish the builds separately, from a proper build machine.");
  };

  return 0;
});


///////////////////////////////////////////////////////////////////////////////
// search & show
///////////////////////////////////////////////////////////////////////////////


main.registerCommand({
  name: 'show',
  pretty: true,
  minArgs: 1,
  maxArgs: 1,
  options: {
    "show-old": {type: Boolean, required: false }
  },
  catalogRefresh: new catalog.Refresh.OnceAtStart({ maxAge: DEFAULT_MAX_AGE, ignoreErrors: true })
}, function (options) {
  // We should refresh the catalog in case there are new versions.
  //refreshOfficialCatalogOrDie({ maxAge: DEFAULT_MAX_AGE });

  // We only show compatible versions unless we know otherwise.
  var versionVisible = function (record) {
    return options['show-old'] || !record.unmigrated;
  };

  var full = options.args[0].split('@');
  var name = full[0];
  var allRecord = getReleaseOrPackageRecord(name);

  var record = allRecord.record;
  if (!record) {
    Console.error("Unknown package or release: " +  name);
    explainIfRefreshFailed();
    return 1;
  }

  var versionRecords;
  var label;
  var showName;
  if (!allRecord.isRelease) {
    label = "package";
    showName = "Package " + Console.bold(allRecord.record.name);
    var getRelevantRecord = function (version) {
      var versionRecord = catalog.official.getVersion(name, version);
      var myBuilds = _.pluck(catalog.official.getAllBuilds(name, version),
                             'buildArchitectures');
      // Does this package only have a cross-platform build?
      if (myBuilds.length === 1) {
        var allArches = myBuilds[0].split('+');
        if (!_.any(allArches, function (arch) {
          return arch.match(/^os\./);
        })) {
          return versionRecord;
        }
      }
      // This package is only available for some architectures.
      // XXX show in a more human way?
      var myStringBuilds = myBuilds.join(' ');
      return versionRecord ? _.extend({
        buildArchitectures: myStringBuilds
      }, versionRecord) : versionRecord;
    };
    // XXX should this skip pre-releases? No, it should.
    var versions = catalog.official.getSortedVersions(name);
    if (full.length > 1) {
      versions = [full[1]];
    }
    versionRecords = _.map(versions, getRelevantRecord);
    if (full.length > 1 && versionRecords.length == 1 && versionRecords[0]) {
      showName += Console.bold("@" + versionRecords[0].version);
    }
  } else {
    label = "release";
    showName = "Release " + Console.bold(allRecord.record.name);
    if (full.length > 1) {
      versionRecords = [catalog.official.getReleaseVersion(name, full[1])];
      if (versionRecords.length == 1 && versionRecords[0]) {
        showName += Console.bold("@" + versionRecords[0].version);
      }
    } else {
      versionRecords =
        _.map(
          catalog.official.getSortedRecommendedReleaseVersions(name, "").reverse(),
          function (v) {
            return catalog.official.getReleaseVersion(name, v);
          });
    }
  }
  if (_.isEqual(versionRecords, [])) {
    if (allRecord.release) {
      Console.error(
        "No recommended versions of release " + name + " exist.");
    } else {
      Console.error("No versions of package" + name + " exist.");
    }
  } else {
    var lastVersion = versionRecords[versionRecords.length - 1];
    if (!lastVersion && full.length > 1) {
      Console.error(
        full[1] + ": unknown version of " + name);
      return 1;
    }

    if (showName) {
      Console.info(showName + ":\n");
    }

    var unknown = "< unknown >";

    if (full.length > 1) {
      // Specific version with details; we don't expect more than one match
      _.each(versionRecords, function (v) {
        // Don't show versions that we shouldn't be showing.
        if (!versionVisible(v)) {
          return;
        }

        var versionDesc = Console.bold("Version " + v.version);
        if (v.description)
          versionDesc = versionDesc + "    " + v.description;
        Console.info(versionDesc);

        if (v.buildArchitectures) {
          var buildArchitectures = v.buildArchitectures.split(' ');
          Console.info("      Architectures: ", formatAsList(buildArchitectures, { formatter: formatArchitecture }));
        }
        // XXX: else show "no architectures"?
        if (v.packages) {
          Console.info("      tool: " + v.tool);
          Console.info("      packages:");

          _.each(v.packages, function(pv, pn) {
            Console.info("          " + pn + "@" + pv);
          });
        }
      });

      Console.info("\n");
    } else {
      // Non-detailed list of versions

      var rows = [];

      _.each(versionRecords, function (v) {
        // Don't show versions that we shouldn't be showing.
        if (!versionVisible(v)) {
          return;
        }

        var row = ["Version " + v.version, v.description];
        rows.push(row);
      });

      utils.printTwoColumns(rows)
    }
  }

  // Creating the maintainer string. We have anywhere between 1 and lots of
  // maintainers on a package. We probably want output along the lines of
  // "bob", "bob and alice" or "bob, alex and alice".
  var myMaintainerString = "";
  var myMaintainers = _.pluck(record.maintainers, 'username');
  if (myMaintainers.length === 0) {
    Console.debug("No maintainer records found: ", JSON.stringify(record));
  } else if (myMaintainers.length === 1) {
    myMaintainerString = myMaintainers[0];
  } else {
    var myTotal = myMaintainers.length;
    // If we have two maintainers exactly, this is a no-op. Otherwise, it will
    // produce a list of the first (n-2) maintainers, separated by comas.
    _.each(myMaintainers.slice(0, myTotal - 2), function (name) {
      myMaintainerString += name + ", ";
    });
    myMaintainerString +=  myMaintainers[myTotal - 2];
    myMaintainerString +=  " and " +  myMaintainers[myTotal - 1];
  }

  if (myMaintainerString) {
    Console.info("Maintained by:", myMaintainerString + ".");
  }

  if (lastVersion && lastVersion.git) {
    // No full stop, as it makes copying and pasting painful
    Console.info("Git repository at:", Console.url(lastVersion.git));
  }

  if (record && record.homepage) {
    // No full stop, as it makes copying and pasting painful
    Console.info("More information at:", Console.url(record.homepage));
  }
});

main.registerCommand({
  name: 'refresh',
  pretty: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {
  //refreshOfficialCatalogOrDie();
});

main.registerCommand({
  name: 'search',
  pretty: true,
  minArgs: 0, // So we can provide specific help
  maxArgs: 1,
  options: {
    maintainer: {type: String, required: false },
    "show-old": {type: Boolean, required: false },
    "show-rcs": {type: Boolean, required: false},
    // Undocumented debug-only option for Velocity.
    "debug-only": {type: Boolean, required: false}
  },
  catalogRefresh: new catalog.Refresh.OnceAtStart({ maxAge: DEFAULT_MAX_AGE, ignoreErrors: true })
}, function (options) {
  if (options.args.length === 0) {
    Console.info("To show all packages, do", Console.command("meteor search ."));
    return 1;
  }

  // Show all means don't do any filtering at all. So, don't do any filtering
  // for anything at all.
  if (options["show-rcs"]) {
    options["show-old"] = true;
  }

  // XXX this is dumb, we should be able to search even if we can't
  // refresh. let's make sure to differentiate "horrible parse error while
  // refreshing" from "can't connect to catalog"
  //refreshOfficialCatalogOrDie({ maxAge: DEFAULT_MAX_AGE });

  var allPackages = catalog.official.getAllPackageNames();
  var allReleases = catalog.official.getAllReleaseTracks();
  var matchingPackages = [];
  var matchingReleases = [];

  var selector;
  var pattern = options.args[0];

  var search;
  try {
    search = new RegExp(pattern);
  } catch (err) {
    Console.error(err + "");
    return 1;
  }

  // Do not return true on broken packages, unless requested in options.
  var filterBroken = function (match, isRelease, name) {
    // If the package does not match, or it is not a package at all or if we
    // don't want to filter anyway, we do not care.
    if (!match || isRelease)
      return match;
    var vr;
    if (!options["show-rcs"]) {
      vr = catalog.official.getLatestMainlineVersion(name);
    } else {
      vr = catalog.official.getLatestVersion(name);
    }
    if (!vr) {
      return false;
    }
    // If we did NOT ask for unmigrated packages and this package is unmigrated,
    // we don't care.
    if (!options["show-old"] && vr.unmigrated){
      return false;
    }
    // If we asked for debug-only packages and this package is NOT debug only,
    // we don't care.
    if (options["debug-only"] && !vr.debugOnly) {
      return false;
    }
    return true;
  };

  if (options.maintainer) {
    var username =  options.maintainer;
    // In the future, we should consider checking this on the server, but I
    // suspect the main use of this command will be to deal with the automatic
    // migration and uncommon in everyday use. From that perspective, it makes
    // little sense to require you to be online to find out what packages you
    // own; and the consequence of not mentioning your group packages until
    // you update to a new version of meteor is not that dire.
    selector = function (name, isRelease) {
      var record;
      // XXX make sure search works while offline
      if (isRelease) {
        record = catalog.official.getReleaseTrack(name);
      } else {
        record = catalog.official.getPackage(name);
      }
      return filterBroken((name.match(search) &&
        !!_.findWhere(record.maintainers, {username: username})),
        isRelease, name);
    };
  } else {
    selector = function (name, isRelease) {
      return filterBroken(name.match(search),
        isRelease, name);
    };
  }


  buildmessage.enterJob({ title: 'Searching packages' }, function () {
    _.each(allPackages, function (pack) {
      if (selector(pack, false)) {
        var vr;
        if (!options['show-rcs']) {
          vr = catalog.official.getLatestMainlineVersion(pack);
        } else {
          vr = catalog.official.getLatestVersion(pack);
        }
        if (vr) {
          matchingPackages.push(
            { name: pack, description: vr.description});
        }
      }
    });
    _.each(allReleases, function (track) {
      if (selector(track, true)) {
        var vr = catalog.official.getDefaultReleaseVersion(track);
        if (vr) {
          var vrlong = catalog.official.getReleaseVersion(track, vr.version);
          matchingReleases.push(
            { name: track, description: vrlong.description});
        }
      }
    });
  });

  var output = false;
  if (!_.isEqual(matchingPackages, [])) {
    output = true;
    Console.info("Found the following packages:");
    utils.printPackageList(matchingPackages);
  }

  if (!_.isEqual(matchingReleases, [])) {
    output = true;
    Console.info("Found the following releases:");
    utils.printPackageList(matchingReleases);
  }

  if (!output) {
    Console.error(pattern + ': no matching packages or releases found');

    explainIfRefreshFailed();
  } else {
    Console.info(
      "To get more information on a specific item, use", Console.command("meteor show"));
  }
});

///////////////////////////////////////////////////////////////////////////////
// list
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'list',
  requiresApp: true,
  options: {
  },
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: true })
}, function (options) {
  var items = [];

  var newVersionsAvailable = false;

  var messages = buildmessage.capture(function () {
    // Packages that are used by this app
    var packages = project.getConstraints();
    // Versions of the packages. We need this to get the right description for
    // the user, in case it changed between versions.
    var versions = project.getVersions();

    _.each(packages, function (version, name) {
      // Show the version we actually use, not the version we constrain on!
      version = versions[name];

      // Use complete catalog to get the local versions of local packages.
      var versionInfo = catalog.complete.getVersion(name, version);
      if (!versionInfo) {
        buildmessage.error("Cannot process package list. Unknown: " + name +
                           " at version " + version + "\n");
        return;
      }

      var versionAddendum = "" ;
      // If we are not using an rc for this package, then we are not going to
      // update to an rc. But if we are using a pre-release version, then we
      // care about other pre-release versions, and might want to update to a
      // newer one.
      var latest;
      if (!/-/.test(version)) {
          latest = catalog.complete.getLatestMainlineVersion(name, version);
      } else {
          latest = catalog.complete.getLatestVersion(name, version);
      }
      var packageVersionParser = require('./package-version-parser.js');
      if (latest &&
          version !== latest.version &&
          // If we're currently running a prerelease, "latest" may be older than
          // what we're at, so don't tell us we're outdated!
          packageVersionParser.lessThan(version, latest.version) &&
          !catalog.complete.isLocalPackage(name)) {
        versionAddendum = "*";
        newVersionsAvailable = true;
      } else {
        versionAddendum = " ";
      }

      var description = version + versionAddendum +
            (versionInfo.description ?
             (" " + versionInfo.description) : "");
      items.push({ name: name, description: description });

    });
  });
  if (messages.hasMessages()) {
    Console.printMessages(messages);
    return 1;
  }

  // Append extra information about special packages such as Cordova plugins
  // to the list.
  var plugins = project.getCordovaPlugins();
  _.each(plugins, function (version, name) {
    items.push({ name: 'cordova:' + name, description: version });
  });

  utils.printPackageList(items);

  if (newVersionsAvailable) {
    Console.info(
"\n * New versions of these packages are available! Run 'meteor update' to try\n" +
" to update those packages to their latest versions. If your packages cannot be\n" +
" updated further, try typing meteor add <package>@<newVersion> to see more\n" +
" information.");
  }
  return 0;
});



///////////////////////////////////////////////////////////////////////////////
// update
///////////////////////////////////////////////////////////////////////////////

// Returns 0 if the operation went OK -- either we updated to a new release, or
// decided not to with good reason. Returns something other than 0, if it is not
// safe to proceed (ex: our release track is fundamentally unsafe or there is
// weird catalog corruption).
var maybeUpdateRelease = function (options) {
  // We are only updating packages, so we are not updating the release.
  if (options["packages-only"]) {
     return 0;
  }

  // We are running from checkout, so we are not updating the release.
  if (release.current && release.current.isCheckout()) {
    Console.error(
"You are running Meteor from a checkout, so we cannot update the Meteor release.\n" +
"Checking to see if we can update your packages.");
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
        release.current.getReleaseTrack() : catalog.DEFAULT_TRACK;

  // Unless --release was passed (in which case we ought to already have
  // springboarded to that release), go get the latest release and switch to
  // it. (We already know what the latest release is because we refreshed the
  // catalog above.)  Note that after springboarding, we will hit this again.
  // However, the override that's done by SpringboardToLatestRelease also sets
  // release.forced (although it does not set release.explicit), so we won't
  // double-springboard.  (We might miss an super recently published release,
  // but that's probably OK.)
  if (! release.forced) {
    var latestRelease = release.latestKnown(releaseTrack);

    // Are we on some track without ANY recommended releases at all,
    // and the user ran 'meteor update' without specifying a release? We
    // really can't do much here.
    if (!latestRelease) {
      Console.error(
        "There are no recommended releases on release track " +
          releaseTrack + ".");
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
        "Installed. Run 'meteor update' inside of a particular project\n" +
          "directory to update that project to " +
          release.current.getDisplayName() + ".");
    } else {
      // We get here if the user ran 'meteor update' and we didn't
      // find a new version.
      Console.info(
        "The latest version of Meteor, " + release.current.getReleaseVersion() +
          ", is already installed on this\n" +
          "computer. Run 'meteor update' inside of a particular project\n" +
          "directory to update that project to " +
          release.current.getDisplayName());
    }
    return 0;
  }

  // Otherwise, we have to upgrade the app too, if the release changed.
  var appRelease = project.getNormalizedMeteorReleaseVersion();
  if (appRelease !== null && appRelease === release.current.name) {
    var maybeTheLatestRelease = release.forced ? "" : ", the latest release";
    Console.info(
      "This project is already at " +
        release.current.getDisplayName() + maybeTheLatestRelease + ".");
    return 0;
  }

  var appTrackAndVersion = utils.splitReleaseName(appRelease);

  // XXX did we have to change some package versions? we should probably
  //     mention that fact.
  // XXX error handling.

  // Figuring out which release to use to update the app is slightly more
  // complicated, because we have to run the constraint solver. So, we need to
  // try multiple releases, defined by the various options passed in.
  var releaseVersionsToTry;
  if (options.patch) {
    // Can't make a patch update if you are not running from a current
    // release. In fact, you are doing something wrong, so we should tell you
    // to stop.
    if (appRelease == null) {
      Console.error(
        "Cannot patch update unless a release is set.");
      return 1;
    }
    var record = catalog.official.getReleaseVersion(
      appTrackAndVersion[0], appTrackAndVersion[1]);
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
    var patchRecord = catalog.official.getReleaseVersion(r[0], updateTo);
    // It looks like you are not at the latest patch version,
    // technically. But, in practice, we cannot update you to the latest patch
    // version because something went wrong. For example, we can't find the
    // record for your patch version (probably some sync
    // failure). Alternatively, maybe we put out a patch release and found a
    // bug in it -- since we tell you to always run update --patch, we should
    // not try to patch you to an unfriendly release. So, either way, as far
    // as we are concerned you are at the 'latest patch version'
    if (!patchRecord || !patchRecord.recommended ) {
      Console.error(
        "You are at the latest patch version.");
      return 0;
    }
    // Great, we found a patch version. You can only have one latest patch for
    // a string of releases, so there is just one release to try.
    releaseVersionsToTry = [updateTo];
  } else if (release.explicit) {
    // You have explicitly specified a release, and we have springboarded to
    // it. So, we will use that release to update you to itself, if we can.
    releaseVersionsToTry = [release.current.getReleaseVersion()];
  } else {
    // We are not doing a patch update, or a specific release update, so we need
    // to try all recommended releases on our track, whose order key is greater
    // than the app's.
    var appReleaseInfo = catalog.official.getReleaseVersion(
      appTrackAndVersion[0], appTrackAndVersion[1]);
    var appOrderKey = (appReleaseInfo && appReleaseInfo.orderKey) || null;

    releaseVersionsToTry = catalog.official.getSortedRecommendedReleaseVersions(
      appTrackAndVersion[0], appOrderKey);
    if (!releaseVersionsToTry.length) {
      // We could not find any releases newer than the one that we are on, on
      // that track, so we are done.
      var releaseToPrint = utils.displayRelease(
        appTrackAndVersion[0], appTrackAndVersion[1]);
      Console.info(
"This project is already at " + releaseToPrint + ", which is newer\n" +
"than the latest release.");
      return 0;
    }
  }

  var solutionReleaseRecord = null;
  var solutionPackageVersions = null;
  var directDependencies = project.getConstraints();
  var previousVersions;
  var messages = buildmessage.capture(function () {
    previousVersions = project.getVersions({dontRunConstraintSolver: true});
  });
  if (messages.hasMessages()) {
    Console.printMessages(messages);
    // We couldn't figure out our current versions, so updating is not going to work.
    return 1;
  }

  var solutionReleaseVersion = _.find(releaseVersionsToTry, function (versionToTry) {
    var releaseRecord = catalog.official.getReleaseVersion(
      releaseTrack, versionToTry);
    if (!releaseRecord)
      throw Error("missing release record?");
    var constraints = doOrDie(function () {
      return project.calculateCombinedConstraints(releaseRecord.packages);
    });
    try {
      var messages = buildmessage.capture(function () {
        solutionPackageVersions = catalog.complete.resolveConstraints(
          constraints,
          { previousSolution: previousVersions },
          { ignoreProjectDeps: true });
      });
      if (messages.hasMessages()) {
        if (process.env.METEOR_UPDATE_DEBUG) {
          Console.error(
            "Update to release " + releaseTrack + "@" + versionToTry +
              " is impossible:\n" + messages.formatMessages());
        }
        return false;
      }
    } catch (e) {
      if (process.env.METEOR_UPDATE_DEBUG) {
        Console.error(
          "Update to release " + releaseTrack +
            "@" + versionToTry + " impossible: " + e.message );
      }
      return false;
    }
    solutionReleaseRecord = releaseRecord;
    return true;
  });

  if (!solutionReleaseVersion) {
    Console.info(
      "This project is at the latest release which is compatible with your\n" +
        "current package constraints.");
    return 0;
  } else  if (solutionReleaseVersion !== releaseVersionsToTry[0]) {
    Console.info(
      "(Newer releases are available but are not compatible with your\n" +
        "current package constraints.)");
  }

  var solutionReleaseName = releaseTrack + '@' + solutionReleaseVersion;

  // We could at this point springboard to solutionRelease (which is no newer
  // than the release we are currently running), but there's no super-clear advantage
  // to this yet. The main reason might be if we decide to delete some
  // backward-compatibility code which knows how to deal with an older release,
  // but if we actually do that, we can change this code to add the extra
  // springboard at that time.
  var upgraders = require('./upgraders.js');
  var upgradersToRun = upgraders.upgradersToRun();

  // Write the new versions to .meteor/packages and .meteor/versions.
  var setV = project.setVersions(solutionPackageVersions,
                                 { alwaysRecord: true });
  project.showPackageChanges(previousVersions, solutionPackageVersions, {
    onDiskPackages: setV.downloaded
  });
  if (!setV.success) {
    Console.error("Could not install all the requested packages.");
    return 1;
  }

  // Write the release to .meteor/release.
  project.writeMeteorReleaseVersion(solutionReleaseName);

  Console.info(path.basename(options.appDir) + ": updated to " +
                       utils.displayRelease(releaseTrack, solutionReleaseVersion) +
                       ".");

  // Now run the upgraders.
  // XXX should we also run upgraders on other random commands, in case there
  // was a crash after changing .meteor/release but before running them?
  _.each(upgradersToRun, function (upgrader) {
    upgraders.runUpgrader(upgrader);
    project.appendFinishedUpgrader(upgrader);
  });

  // We are done, and we should pass the release that we upgraded to, to the user.
  return 0;
};


main.registerCommand({
  name: 'update',
  options: {
    patch: { type: Boolean, required: false },
    "packages-only": { type: Boolean, required: false }
  },
  // We have to be able to work without a release, since 'meteor
  // update' is how you fix apps that don't have a release.
  requiresRelease: false,
  minArgs: 0,
  maxArgs: Infinity,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: true })
}, function (options) {
  // Refresh the catalog, cacheing the remote package data on the server.
  // XXX should be able to update even without a refresh, esp to a specific
  //     server
  //refreshOfficialCatalogOrDie();

  // If you are specifying packaging individually, you probably don't want to
  // update the release.
  if (options.args.length > 0) {
    options["packages-only"] = true;
  }

  // Some basic checks to make sure that this command is being used correctly.
  if (options["packages-only"] && options["patch"]) {
    Console.error("There is no such thing as a patch update to packages.");
    return 1;
  }

  if (release.explicit && options["patch"]) {
    Console.error("You cannot patch update to a specific release.");
    return 1;
  }

  var releaseUpdateStatus = maybeUpdateRelease(options);
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

  // For calculating constraints, we need to take into account the project's
  // release. This might not be the release that we are actually running --
  // because we might have springboarded to the latest release, but been unable
  // to update to it.
  var releasePackages = {};
  if (release.current.isProperRelease()) {
    // We are not running from checkout, and we are in an app directory, and we
    // are running 'update', which is the one command that doesn't allow
    // arbitrary release overrides (ie, if we did that, we wouldn't be
    // here). So, basically, that's the correct release for this to project to
    // have constraints against.
    var appRelease = project.getNormalizedMeteorReleaseVersion();
    var r = utils.splitReleaseName(appRelease);
    var appRecord = catalog.official.getReleaseVersion(r[0], r[1]);
    if (appRecord) {
      releasePackages = appRecord.packages;
    } else {
      releasePackages = {};
    }
  }

  // Let's figure out what packages we are currently using. Don't run the
  // constraint solver yet, we don't care about reconciling them, just want to
  // know what they are for some internal constraint solver heuristics.
  var versions, allPackages;
  messages = buildmessage.capture(function () {
    versions = project.getVersions({dontRunConstraintSolver: true});
    allPackages = project.calculateCombinedConstraints(releasePackages);
  });
  if (messages.hasMessages()) {
    Console.printMessages(messages);
    return 1;
  }

  // If no packages have been specified, then we will send in a request to
  // update all direct dependencies. If a specific list of packages has been
  // specified, then only upgrade those.
  var upgradePackages = [];
  if (options.args.length === 0) {
    // We don't want to auto-upgrade weak dependencies (that we get from the
    // release), even though there is not much harm in it.
    upgradePackages = _.pluck(
      _.reject(allPackages, function (packSpec) {
        return _.has(packSpec, 'weak') && packSpec.weak;
      }), 'name');
  } else {
    upgradePackages = options.args;
  }

  // Call the constraint solver. This should not fail, since we are not adding
  // any constraints that we didn't have before.
  var newVersions;
  var messages = buildmessage.capture(function () {
    newVersions = catalog.complete.resolveConstraints(allPackages, {
      previousSolution: versions,
      upgrade: upgradePackages
    }, {
      ignoreProjectDeps: true
    });
  });
  if (messages.hasMessages()) {
    Console.error("Error resolving constraints for packages:\n"
                         + messages.formatMessages());
    return 1;
  }

  // Check that every requested package is actually used by the project, and
  // print an error if they are not. We don't check this on the original
  // versions because it could be out of date to begin with (ex: if you edited
  // the packages file) and we don't throw an error because, technically, it is
  // not an error. You could have gotten here by requesting updates of
  // transitive dependencies that are no longer there.
  _.each(upgradePackages, function (packageName) {
    if (! _.has(newVersions, packageName)) {
      Console.error(packageName + ': package is not in the project');
    }
  });

  // Just for the sake of good messages, check to see if anything changed.
  if (_.isEqual(newVersions, versions)) {
    Console.info("Your packages are at their latest compatible versions.");
    return 0;
  }

  // Set our versions and download the new packages.
  var setV = project.setVersions(newVersions, { alwaysRecord: true });

  // Sometimes, we don't show changes -- for example, if you don't have a
  // versions file. However, I think that if you don't have a versions file, and
  // you are running update, it is OK to show you a bunch of output (and
  // confusing not to).
  var showExitCode = project.showPackageChanges(
    versions, newVersions,
    { onDiskPackages: setV.downloaded,
      alwaysShow: true });

  if (!setV.success) {
    Console.error("Could not install all the requested packages.");
    return 1;
  }
  return showExitCode;
});

///////////////////////////////////////////////////////////////////////////////
// add
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'add',
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true,
  pretty: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: true })
}, function (options) {

  // Special case on reserved package namespaces, such as 'cordova'
  var cordovaPlugins;
  try {
    var filteredPackages = cordova.filterPackages(options.args);
    cordovaPlugins = filteredPackages.plugins;

    _.each(cordovaPlugins, function (plugin) {
      cordova.checkIsValidPlugin(plugin);
    });
  } catch (err) {
    Console.error(err.message + '');
    return 1;
  }

  var oldPlugins = project.getCordovaPlugins();

  var pluginsDict = {};
  _.each(cordovaPlugins, function (s) {
    var splt = s.split('@');
    if (splt.length !== 2)
      throw new Error(s + ': exact version or tarball url is required');
    pluginsDict[splt[0]] = splt[1];
  });
  project.addCordovaPlugins(pluginsDict);

  _.each(cordovaPlugins, function (plugin) {
    Console.info("added cordova plugin " + plugin);
  });

  var args = filteredPackages.rest;

  if (_.isEmpty(args))
    return 0;

  // For every package name specified, add it to our list of package
  // constraints. Don't run the constraint solver until you have added all of
  // them -- add should be an atomic operation regardless of the package
  // order. Even though the package file should specify versions of its inputs,
  // we don't specify these constraints until we get them back from the
  // constraint solver.
  //
  // In the interests of failing fast, we do this check before refreshing the
  // catalog, touching the project, etc, since these parsings are purely
  // syntactic.
  var constraints = _.map(options.args, function (packageReq) {
    try {
      return utils.parseConstraint(packageReq);
    } catch (e) {
      if (!e.versionParserError)
        throw e;
      console.log("Error: " + e.message);
      throw new main.ExitWithCode(1);
    }
  });

  var failed = false;

  // Refresh the catalog, cacheing the remote package data on the server.
  // XXX ensure this works while offline
  //refreshOfficialCatalogOrDie();

  // Read in existing package dependencies.
  var packages = project.getConstraints();

  var allPackages;
  var messages = buildmessage.capture({ title: 'Combining constraints' }, function () {
    // Combine into one object mapping package name to list of constraints, to
    // pass in to the constraint solver.
    allPackages = project.getCurrentCombinedConstraints();
  });
  if (messages.hasMessages()) {
    Console.printMessages(messages);
    explainIfRefreshFailed();
    return 1;
  }

  _.each(constraints, function (constraint) {
    // Check that the package exists.
    doOrDie({title: 'Checking package: ' + constraint.name }, function () {
      if (! catalog.complete.getPackage(constraint.name)) {
        Console.error(constraint.name + ": no such package");
        failed = true;
        return;
      }
    });

    // If the version was specified, check that the version exists.
    _.each(constraint.constraints, function (constr) {
      if (constr.version !== null) {
        var versionInfo = doOrDie({ title: 'Fetching packages' }, function () {
          return catalog.complete.getVersion(constraint.name, constr.version);
        });
        if (! versionInfo) {
          Console.stderr.write(
            constraint.name + "@" + constr.version  + ": no such version\n");
          failed = true;
          return;
        }
      }
    });
    // Check that the constraint is new. If we are already using the package at
    // the same constraint in the app, return from this function, but don't
    // fail. Rejecting the entire command because a part of it is a no-op is
    // confusing.
    if (_.has(packages, constraint.name)) {
      if (!packages[constraint.name] && !constraint.constraintString) {
        Console.info(
          constraint.name +
            " without a version constraint has already been added.");
      }
      else if (packages[constraint.name] === constraint.constraintString) {
        Console.info(
          constraint.name + " with version constraint " +
            constraint.constraintString + " has already been added.");
      } else {
        if (packages[constraint.name]) {
          Console.info(
            "Currently using " + constraint.name +
              " with version constraint " + packages[constraint.name]
              + ".");
        } else {
          Console.info("Currently using "+  constraint.name +
                               " without any version constraint.");
        }
        if (constraint.constraintString) {
          Console.info("The version constraint will be changed to " +
                               constraint.constraintString + ".");
        } else {
          Console.info("The version constraint will be removed.");
        }
        // Now remove the old constraint from what we're going to calculate
        // with. (XXX: This is hacky.)
        var removed = false;
        var oldC = "";
        if (packages[constraint.name]) {
          oldC = "@" + packages[constraint.name];
        }
        var oldConstraint = utils.parseConstraint(
          constraint.name + oldC);

        for (var i = 0; i < allPackages.length; ++i) {
          if (_.isEqual(oldConstraint, allPackages[i])) {
            removed = true;
            allPackages.splice(i, 1);
            break;
          }
        }
        if (!removed) {
          throw Error("Couldn't find constraint to remove: " +
                      JSON.stringify(constraint.constraintString));
        }
      }
    }

    // Add the package to our direct dependency constraints that we get
    // from .meteor/packages.
    packages[constraint.name] = constraint.constraintString;

    // Also, add it to all of our combined dependencies.
    allPackages.push(constraint);

  });

  // If the user asked for invalid packages, then the user probably expects a
  // different result than what they are going to get. We have already logged an
  // error, so we should exit.
  if ( failed ) {
    explainIfRefreshFailed();

    return 1;
  }

  var versions, newVersions;

  try {
    var messages = buildmessage.capture(function () {
      // Get the contents of our versions file. We need to pass them to the
      // constraint solver, because our contract with the user says that we will
      // never downgrade a dependency.
      versions = project.getVersions();

      // Call the constraint solver.
      newVersions = catalog.complete.resolveConstraints(
        allPackages,
        { previousSolution: versions },
        { ignoreProjectDeps: true });

      if ( ! newVersions) {
        // XXX: Better error handling.
        Console.error("Cannot resolve package dependencies.");
        explainIfRefreshFailed();
        return;
      }

      // Don't tell the user what all the operations were until we finish -- we
      // don't want to give a false sense of completeness until everything is
      // written to disk.
      var messageLog = [];
    });
  } catch (e) {
    if (!e.constraintSolverError)
      throw e;
    // XXX this is too many forms of error handling!
    Console.error(
      "Could not satisfy all the specified constraints:\n"
        + e + "");
    explainIfRefreshFailed();
    return 1;
  }
  if (messages.hasMessages()) {
    Console.printMessages(messages);
    explainIfRefreshFailed();
    return 1;
  }

  // Install the new versions. If all new versions were installed successfully,
  // then change the .meteor/packages and .meteor/versions to match expected
  // reality.
  var downloaded = project.addPackages(constraints, newVersions);

  var ret = project.showPackageChanges(versions, newVersions, {
    onDiskPackages: downloaded});
  if (ret !== 0) return ret;

  // Show the user the messageLog of the packages that they installed.
  // (XXX: this will be rewritten pending geoff's feedback on packaging UX)
  Console.stdout.write("\n");
  _.each(constraints, function (constraint) {
    var version = newVersions[constraint.name];
    var versionRecord = doOrDie(function () {
      return catalog.complete.getVersion(constraint.name, version);
    });
    Console.stdout.write(constraint.name +
                         (versionRecord.description ?
                          (": " + versionRecord.description) :
                          ""));
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
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: true })
}, function (options) {
  // Special case on reserved package namespaces, such as 'cordova'
  var filteredPackages = cordova.filterPackages(options.args);
  var cordovaPlugins = filteredPackages.plugins;

  // Update the plugins list
  var removedPlugins = project.removeCordovaPlugins(cordovaPlugins);
  var notRemoved = _.difference(cordovaPlugins, removedPlugins);

  _.each(removedPlugins, function (plugin) {
    Console.info("removed cordova plugin " + plugin);
  });

  _.each(notRemoved, function (plugin) {
    Console.error(plugin + " is not in this project.");
  });

  var args = filteredPackages.rest;

  if (_.isEmpty(args))
    return 0;

  // As user may expect this to update the catalog, but we con't actually need
  // to, and it takes frustratingly long.
  // refreshOfficialCatalogOrDie();

  // Read in existing package dependencies.
  var packages = project.getConstraints();

  // For each package name specified, check if we already have it and warn the
  // user. Because removing each package is a completely atomic operation that
  // has no chance of failure, this is just a warning message, it doesn't cause
  // us to stop.
  var packagesToRemove = [];
  _.each(args, function (packageName) {
    if (/@/.test(packageName)) {
      Console.error(packageName + ": do not specify version constraints.");
    } else if (! _.has(packages, packageName)) {
      // Check that we are using the package. We don't check if the package
      // exists. You should be able to remove non-existent packages.
      Console.error(packageName  + " is not in this project.");
    } else {
      packagesToRemove.push(packageName);
    }
  });

  var messages = buildmessage.capture(function () {
    // Get the contents of our versions file, we will want them in order to
    // remove to the user what we removed. Note that we are actually just getting
    // getting the versions file, not running the constraint solver.
    var versions = project.dependencies;

    // Remove the packages from the project! There is really no way for this to
    // fail, unless something has gone horribly wrong, so we don't need to check
    // for it.
    project.removePackages(packagesToRemove);

    // Retrieve the new dependency versions that we have chosen for this project
    // and do some pretty output reporting.
    var newVersions = project.getVersions();
  });
  if (messages.hasMessages()) {
    Console.printMessages(messages);
    return 1;
  }

  // Log that we removed the constraints. It is possible that there are
  // constraints that we officially removed that the project still 'depends' on,
  // which is why there are these two tiers of error messages.
  if (! _.isEmpty(packagesToRemove))
    Console.info("");
  _.each(packagesToRemove, function (packageName) {
    Console.info(packageName + ": removed dependency");
  });

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
}, function (options) {

  // We want the most recent information.
  //refreshOfficialCatalogOrDie();

  var name = options.args[0];

  // Yay, checking that options are correct.
  if (options.add && options.remove) {
    Console.error(
      "Sorry, you can only add or remove one user at a time.");
    return 1;
  }
  if ((options.add || options.remove) && options.list) {
    Console.error(
"Sorry, you can't change the users at the same time as you're listing them.");
    return 1;
  }

  // Now let's get down to business! Fetching the thing.
  var fullRecord = getReleaseOrPackageRecord(name);
  var record = fullRecord.record;
  if (!options.list) {

    try {
      var conn = packageClient.loggedInPackagesConnection();
    } catch (err) {
      packageClient.handlePackageServerConnectionError(err);
      return 1;
    }

    try {
      if (options.add) {
        Console.info("Adding a maintainer to " + name + "...");
        if (fullRecord.release) {
          packageClient.callPackageServer(
            conn, 'addReleaseMaintainer', name, options.add);
        } else {
          packageClient.callPackageServer(
            conn, 'addMaintainer', name, options.add);
        }
      } else if (options.remove) {
        Console.info("Removing a maintainer from " + name + "...");
        if (fullRecord.release) {
          packageClient.callPackageServer(
            conn, 'removeReleaseMaintainer', name, options.remove);
        } else {
          packageClient.callPackageServer(
            conn, 'removeMaintainer', name, options.remove);
        }
        Console.info(" Done!");
      }
    } catch (err) {
      packageClient.handlePackageServerConnectionError(err);
      return 1;
    }
    conn.close();

    // Update the catalog so that we have this information, and find the record
    // again so that the message below is correct.
    refreshOfficialCatalogOrDie();
    fullRecord = getReleaseOrPackageRecord(name);
    record = fullRecord.record;
  }

  if (!record) {
    Console.info(
"Could not get list of maintainers: package " + name + " does not exist.");
    return 1;
  }

  Console.info("\nThe maintainers for " + name + " are:");
  _.each(record.maintainers, function (user) {
    if (! user || !user.username)
      Console.info("<unknown>");
    else
      Console.info(user.username + "");
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

  // In this function, we want to use the official catalog everywhere, because
  // we assume that all packages have been published (along with the release
  // obviously) and we want to be sure to only bundle the published versions.
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {
  var releaseNameAndVersion = options.args[0];
  var outputDirectory = options.args[1];

  var parsed = utils.splitConstraint(releaseNameAndVersion);
  if (!parsed.constraint)
    throw new main.ShowUsage;

  var release = catalog.official.getReleaseVersion(
    parsed.package, parsed.constraint);
  if (!release) {
    // XXX this could also mean package unknown.
    Console.error('Release unknown: ' + releaseNameAndVersion + '');
    return 1;
  }

  var toolPkg = release.tool && utils.splitConstraint(release.tool);
  if (! (toolPkg && toolPkg.constraint))
    throw new Error("bad tool in release: " + toolPkg);
  var toolPkgBuilds = catalog.official.getAllBuilds(
    toolPkg.package, toolPkg.constraint);
  if (!toolPkgBuilds) {
    // XXX this could also mean package unknown.
    Console.error('Tool version unknown: ' + release.tool + '');
    return 1;
  }
  if (!toolPkgBuilds.length) {
    Console.error('Tool version has no builds: ' + release.tool + '');
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

  Console.error(
    'Building bootstrap tarballs for architectures ' +
      osArches.join(', ') + '');
  // Before downloading anything, check that the catalog contains everything we
  // need for the OSes that the tool is built for.
  var messages = buildmessage.capture(function () {
    _.each(osArches, function (osArch) {
      _.each(release.packages, function (pkgVersion, pkgName) {
        buildmessage.enterJob({
          title: "Looking up " + pkgName + "@" + pkgVersion + " on " + osArch
        }, function () {
          if (!catalog.official.getBuildsForArches(pkgName, pkgVersion, [osArch])) {
            buildmessage.error("missing build of " + pkgName + "@" + pkgVersion +
                               " for " + osArch);
          }
        });
      });
    });
  });

  if (messages.hasMessages()) {
    Console.error("\n" + messages.formatMessages());
    return 1;
  };

  files.mkdir_p(outputDirectory);

  // Get a copy of the data.json.
  var dataTmpdir = files.mkdtemp();
  var tmpDataFile = path.join(dataTmpdir, 'packages.data.db');

  var tmpCatalog = new catalogRemote.RemoteCatalog();
  tmpCatalog.initialize({
    packageStorage: tmpDataFile
  });
  try {
    packageClient.updateServerPackageData(tmpCatalog, null);
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 2;
  }

  // Since we're making bootstrap tarballs, we intend to recommend this release,
  // so we should ensure that once it is downloaded, it knows it is recommended
  // rather than having a little identity crisis and thinking that a past
  // release is the latest recommended until it manages to sync.
  tmpCatalog.forceRecommendRelease(parsed.package, parsed.constraint);
  tmpCatalog.closePermanently();
  if (fs.existsSync(tmpDataFile + '-wal')) {
    throw Error("Write-ahead log still exists for " + tmpDataFile
                + " so the data file will be incomplete!");
  }

  _.each(osArches, function (osArch) {
    var tmpdir = files.mkdtemp();
    // We're going to build and tar up a tropohouse in a temporary directory; we
    // don't want to use any of our local packages, so we use catalog.official
    // instead of catalog.
    // XXX update to '.meteor' when we combine houses
    var tmpTropo = new tropohouse.Tropohouse(
      path.join(tmpdir, '.meteor'), catalog.official);
    buildmessage.enterJob({
      title: "Downloading tool package " + toolPkg.package + "@" +
        toolPkg.constraint
    }, function () {
      tmpTropo.maybeDownloadPackageForArchitectures({
        packageName: toolPkg.package,
        version: toolPkg.constraint,
        architectures: [osArch]  // XXX 'web.browser' too?
      });
    });
    _.each(release.packages, function (pkgVersion, pkgName) {
      // XXX use forkJoin?
      buildmessage.enterJob({
        title: "Downloading package " + pkgName + "@" + pkgVersion
      }, function () {
        tmpTropo.maybeDownloadPackageForArchitectures({
          packageName: pkgName,
          version: pkgVersion,
          architectures: [osArch]  // XXX 'web.browser' too?
        });
      });
    });

    // Install the sqlite DB file we synced earlier. We have previously
    // confirmed that the "-wal" file (which could contain extra log entries
    // that haven't been flushed to the main file yet) doesn't exist, so we
    // don't have to copy it.
    files.copyFile(tmpDataFile, config.getPackageStorage(tmpTropo));

    // Create the top-level 'meteor' symlink, which links to the latest tool's
    // meteor shell script.
    var toolIsopackPath =
          tmpTropo.packagePath(toolPkg.package, toolPkg.constraint);
    var toolIsopack = new isopack.Isopack;
    toolIsopack.initFromPath(toolPkg.package, toolIsopackPath);
    var toolRecord = _.findWhere(toolIsopack.toolsOnDisk, {arch: osArch});
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

// We will document how to set banners on things in a later release.
main.registerCommand({
  name: 'admin set-banners',
  minArgs: 1,
  maxArgs: 1,
  hidden: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {
  var bannersFile = options.args[0];
  try {
    var bannersData = fs.readFileSync(bannersFile, 'utf8');
    bannersData = JSON.parse(bannersData);
  } catch (e) {
    Console.error("Could not parse banners file: ");
    Console.error(e.message + "");
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
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    packageClient.callPackageServer(
      conn, 'setBannersOnReleases',
      bannersData.track, bannersData.banners);
  } catch (e) {
    packageClient.handlePackageServerConnectionError(e);
    return 1;
  }

  // Refresh afterwards.
  refreshOfficialCatalogOrDie();
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
}, function (options) {

  // We want the most recent information.
  //refreshOfficialCatalogOrDie();
  var release = options.args[0].split('@');
  var name = release[0];
  var version = release[1];
  if (!version) {
    Console.error('\n Must specify release version (track@version)');
    return 1;
  }

  // Now let's get down to business! Fetching the thing.
  var record = catalog.official.getReleaseTrack(name);
  if (!record) {
    Console.error('\n There is no release track named ' + name);
    return 1;
  }

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    if (options.unrecommend) {
      Console.info("Unrecommending " + name + "@" + version + "...");
      packageClient.callPackageServer(conn, 'unrecommendVersion', name, version);
      Console.info("Done!\n " + name + "@" + version  +
                           " is no longer a recommended release");
    } else {
      Console.info("Recommending " + options.args[0] + "...");
      packageClient.callPackageServer(conn, 'recommendVersion', name, version);
      Console.info("Done!\n " +  name + "@" + version +
                           " is now  a recommended release");
    }
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  conn.close();
  refreshOfficialCatalogOrDie();

  return 0;
});


main.registerCommand({
  name: 'admin set-earliest-compatible-version',
  minArgs: 2,
  maxArgs: 2,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {

  // We want the most recent information.
  //refreshOfficialCatalogOrDie();
  var package = options.args[0].split('@');
  var name = package[0];
  var version = package[1];
  if (!version) {
    Console.error('\n Must specify release version (track@version)');
    return 1;
  }
  var ecv = options.args[1];

  // Now let's get down to business! Fetching the thing.
  var record = catalog.official.getPackage(name);
  if (!record) {
    Console.error('\n There is no package named ' + name);
    return 1;
  }

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
      Console.info(
        "Setting earliest compatible version on "
          + options.args[0] + " to " + ecv + "...");
      var versionInfo = { name : name,
                          version : version };
      packageClient.callPackageServer(conn,
          '_setEarliestCompatibleVersion', versionInfo, ecv);
      Console.info("Done!");
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  conn.close();
  refreshOfficialCatalogOrDie();

  return 0;
});

main.registerCommand({
  name: 'admin change-homepage',
  minArgs: 2,
  maxArgs: 2,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {

  // We want the most recent information.
  //refreshOfficialCatalogOrDie();
  var name = options.args[0];
  var url = options.args[1];

  // Now let's get down to business! Fetching the thing.
  var record = catalog.official.getPackage(name);
  if (!record) {
    Console.error('\n There is no package named ' + name);
    return 1;
  }

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    Console.info(
        "Changing homepage on  "
          + name + " to " + url + "...");
      packageClient.callPackageServer(conn,
          '_changePackageHomepage', name, url);
      Console.info("Done!");
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  conn.close();
  refreshOfficialCatalogOrDie();

  return 0;
});


main.registerCommand({
  name: 'admin set-unmigrated',
  minArgs: 1,
  options: {
    "success" : {type: Boolean, required: false}
  },
  hidden: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {

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
    versions = catalog.official.getSortedVersions(name);
  }

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
    var status = options.success ? "successfully" : "unsuccessfully";
    _.each(versions, function (version) {
      process.stdout.write(
        "Setting "
          + name + "@" + version + " as " +
          status + " migrated ...");
      packageClient.callPackageServer(
        conn,
        '_changeVersionMigrationStatus',
        name, version, !options.success);
      process.stdout.write(" done!\n");
    });
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  conn.close();
  refreshOfficialCatalogOrDie();

  return 0;
});


main.registerCommand({
  name: 'admin set-latest-readme',
  minArgs: 1,
  maxArgs: 1,
  options: {
    "commit" : {type: String, required: false},
    "tag" : {type: String, required: false}
  },
  hidden: true,
  catalogRefresh: new catalog.Refresh.OnceAtStart({ ignoreErrors: false })
}, function (options) {

  if (options.commit && options.tag)
    throw new main.ShowUsage;
  if (!options.commit && !options.tag)
    throw new main.ShowUsage;

  // We are going to start with getting the latest version of the package.
  var name = options.args[0];
  var version = catalog.official.getLatestMainlineVersion(name).version;

  var coords = options.tag || options.commit;
  var url = "https://raw.githubusercontent.com/meteor/meteor/" +
      coords + "/packages/" + name + "/README.md";

  try {
    var conn = packageClient.loggedInPackagesConnection();
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }

  try {
      Console.info(
        "Setting README of "
          + name + "@" + version + " to " + url);
      packageClient.callPackageServer(
        conn,
        '_changeReadmeURL',
        name, version, url);
      Console.info(" done!\n");
  } catch (err) {
    packageClient.handlePackageServerConnectionError(err);
    return 1;
  }
  conn.close();
  refreshOfficialCatalogOrDie();

  return 0;
});
