var _ = require("underscore");

var selftest = require("../tool-testing/selftest.js");
var Sandbox = selftest.Sandbox;
var files = require("../fs/files");
var utils = require("../utils/utils.js");

var username = "test";

// Returns a random package name.
var randomizedPackageName = function (username, start) {
  // We often use package names in long, wrapped string output, so having them
  // be a consistent length is very useful.
  var startStr = start ? start + "-" : "";
  return username + ":" + startStr + utils.randomToken().substring(0, 6);
};

// Given a sandbox, that has the app as its currend cwd, read the packages file
// and check that it contains exactly the packages specified, in order.
//
// sand: a sandbox, that has the main app directory as its cwd.
// packages: an array of packages in order. Packages can be of the form:
//
//    meteor-base (ie: name), in which case this will match any
//    version of that package as long as it is included.
//
//    awesome-pack@1.0.0 (ie: name@version) to match that name at that
//    version explicitly. This is for packages that we included at a specific
//    version.
var checkPackages = selftest.markStack(async function (sand, packages) {
  var lines = sand.read(".meteor/packages").split("\n");
  var i = 0;
  for (const line of lines) {
    if (!line) {
      return;
    }
    // If the specified package contains an @ sign, then it has a version
    // number, so we should match everything.
    if (packages[i].split("@").length > 1) {
      await selftest.expectEqual(line, packages[i]);
    } else {
      var pack = line.split("@")[0];
      await selftest.expectEqual(pack, packages[i]);
    }
    i++;
  }
  await selftest.expectEqual(packages.length, i);
});

// Given a sandbox, that has the app as its currend cwd, read the versions file
// and check that it contains the packages that we are looking for. We don't
// check the order, we just want to make sure that the right dependencies are
// in.
//
// sand: a sandbox, that has the main app directory as its cwd.
// packages: an array of packages in order. Packages can be of the form:
//
//    meteor-base (ie: name), in which case this will match any
//    version of that package as long as it is included. This is for packages
//    external to the app, since we don't want this test to fail when we push a
//    new version.
//
//    awesome-pack@1.0.0 (ie: name@version) to match that name at that
//    version explicitly. This is for packages that only exist for the purpose
//    of this test (for example, packages local to this app), so we know exactly
//    what version we expect.
var checkVersions = selftest.markStack(async function (sand, packages) {
  var lines = sand.read(".meteor/versions").split("\n");
  var depend = {};
  _.each(lines, function (line) {
    if (!line) {
      return;
    }
    // Packages are stored of the form foo@1.0.0, so this should give us an
    // array [foo, 1.0.0].
    var split = line.split("@");
    var pack = split[0];
    depend[pack] = split[1];
  });
  var i = 0;
  for (const pack of packages) {
    var split = pack.split("@");
    if (split.length > 1) {
      await selftest.expectEqual(depend[split[0]], split[1]);
    } else {
      var exists = _.has(depend, split[0]);
      await selftest.expectEqual(exists, true);
    }
    i++;
  }
  await selftest.expectEqual(packages.length, i);
});

// Add packages to an app. Change the contents of the packages and their
// dependencies, make sure that the app still refreshes.
selftest.define("change packages during hot code push", [], async function () {
  var s = new Sandbox();
  await s.init();
  var run;

  // Starting a run
  await s.createApp("myapp", "package-tests");
  s.cd("myapp");
  run = s.run();
  run.waitSecs(5);
  await run.match("myapp");
  await run.match("proxy");
  run.waitSecs(5);
  await run.match("your app");
  run.waitSecs(5);
  await run.match("running at");
  await run.match("localhost");
  // Add the local package 'say-something'. It should print a message.
  s.write(".meteor/packages", "meteor-base \n say-something");
  run.waitSecs(3);
  await run.match("initial");

  // Modify the local package 'say-something'.
  s.cd("packages/say-something", function () {
    s.write("foo.js", 'console.log("another");');
  });
  run.waitSecs(12);
  await run.match("another");

  // Add a local package depends-on-plugin.
  s.write(".meteor/packages", "meteor-base \n depends-on-plugin");
  run.waitSecs(2);
  await run.match("foobar");

  // Change something in the plugin.
  s.cd("packages/contains-plugin/plugin", function () {
    s.write("plugin.js", 'console.log("edit");');
  });
  run.waitSecs(2);
  await run.match("edit");
  await run.match("foobar!");

  // Check that we are watching the versions file, as well as the packages file.
  s.unlink(".meteor/versions");
  run.waitSecs(10);
  await run.match("restarted");

  // Switch back to say-something for a moment.
  s.write(".meteor/packages", "meteor-base \n say-something");
  run.waitSecs(3);
  await run.match("another");
  await run.stop();

  s.rename("packages/say-something", "packages/shout-something");
  s.write(".meteor/packages", "meteor-base \n shout-something");
  s.cd("packages/shout-something", function () {
    s.write("foo.js", 'console.log("louder");');
  });

  run = s.run();
  run.waitSecs(5);
  await run.match("myapp");
  await run.match("proxy");
  run.waitSecs(5);
  await run.match("louder"); // the package actually loaded

  // How about breaking and fixing a package.js?
  await s.cd("packages/shout-something", async function () {
    var packageJs = s.read("package.js");
    s.write("package.js", "]");
    run.waitSecs(3);
    await run.match("=> Errors prevented startup");
    await run.match("package.js:1: Unexpected token");
    await run.match("Waiting for file change");

    s.write("package.js", packageJs);
    run.waitSecs(3);
    await run.match("restarting");
    await run.match("restarted");
  });
  await run.stop();
});

selftest.define("add debugOnly and prodOnly packages", [], async function () {
  var s = new Sandbox();
  await s.init();
  var run;

  // Starting a run
  await s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_OFFLINE_CATALOG", "t");

  // Add a debugOnly package. It should work during a normal run, but print
  // nothing in production mode.
  run = s.run("add", "debug-only");
  run.waitSecs(30);
  await run.match("debug-only");
  await run.expectExit(0);

  function onStartup(property) {
    s.mkdir("server");
    s.write(
      "server/exit-test.js",
      [
        "Meteor.startup(() => {",
        "  console.log('Meteor.isDevelopment', Meteor.isDevelopment);",
        "  console.log('Meteor.isProduction', Meteor.isProduction);",
        `  console.log('${property}', global.${property});`,
        `  process.exit(global.${property} ? 234 : 235);`,
        "});",
        "",
      ].join("\n")
    );
  }

  onStartup("DEBUG_ONLY_LOADED");

  run = s.run("--once");
  run.waitSecs(30);
  await run.expectExit(234);

  run = s.run("--once", "--production");
  run.waitSecs(30);
  await run.expectExit(235);

  // Add prod-only package, which sets GLOBAL.PROD_ONLY_LOADED.
  run = s.run("add", "prod-only");
  await run.match("prod-only");
  await run.expectExit(0);

  onStartup("PROD_ONLY_LOADED");

  run = s.run("--once");
  run.waitSecs(30);
  await run.expectExit(235);

  run = s.run("--once", "--production");
  run.waitSecs(30);
  await run.expectExit(234);
});

// Add packages through the command line. Make sure that the correct set of
// changes is reflected in .meteor/packages, .meteor/versions and list.
selftest.define("add packages to app", [], async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  // Starting a run
  await s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_OFFLINE_CATALOG", "t");

  // This has legit version syntax, but accounts-base started with 1.0.0 and is
  // unlikely to backtrack.
  run = s.run("add", "accounts-base@0.123.123");
  await run.matchErr("no such version");
  await run.expectExit(1);

  // Adding a nonexistent package at a nonexistent version should print
  // only one error message, not two. (We used to print "no such
  // package" and "no such version".)
  run = s.run("add", "not-a-real-package-and-never-will-be@1.0.0");
  await run.matchErr("no such package");
  await run.expectExit(1);
  run.forbidAll("no such version");

  run = s.run("add", "accounts-base");

  await run.match("accounts-base: A user account system");
  await run.expectExit(0);

  await checkPackages(s, ["meteor-base", "accounts-base"]);

  // Adding the nonexistent version now should still say "no such
  // version". Regression test for
  // https://github.com/meteor/meteor/issues/2898.
  run = s.run("add", "accounts-base@0.123.123");
  await run.matchErr("no such version");
  await run.expectExit(1);
  run.forbidAll("Currently using accounts-base");
  run.forbidAll("will be changed to");

  run = s.run("--once");

  run = s.run("add", "say-something@1.0.0");
  await run.match("say-something: print to console");
  await run.expectExit(0);

  await checkPackages(s, [
    "meteor-base",
    "accounts-base",
    "say-something@1.0.0",
  ]);

  run = s.run("add", "depends-on-plugin");
  await run.match(/depends-on-plugin.*added,/);
  await run.expectExit(0);

  await checkPackages(s, [
    "meteor-base",
    "accounts-base",
    "say-something@1.0.0",
    "depends-on-plugin",
  ]);

  await checkVersions(s, [
    "accounts-base",
    "depends-on-plugin",
    "say-something",
    "meteor-base",
    "contains-plugin@1.1.0",
  ]);

  run = s.run("remove", "say-something");
  await run.match("say-something: removed dependency");
  await checkVersions(s, [
    "accounts-base",
    "depends-on-plugin",
    "meteor-base",
    "contains-plugin",
  ]);

  run = s.run("remove", "depends-on-plugin");
  await run.match(/contains-plugin.*removed from your project/);
  await run.match(/depends-on-plugin.*removed from your project/);
  await run.match("depends-on-plugin: removed dependency");

  await checkVersions(s, ["accounts-base", "meteor-base"]);
  run = s.run("list");
  await run.match("accounts-base");
  await run.match("meteor-base");

  // Add a description-less package. Check that no weird things get
  // printed (like "added no-description: undefined").
  run = s.run("add", "no-description");
  await run.match("no-description\n");
  await run.expectEnd();
  await run.expectExit(0);
});

selftest.define(
  "add package with both debugOnly and prodOnly",
  [],
  async function () {
    var s = new Sandbox();
    await s.init();
    var run;

    // Add an app with a package with prodOnly and debugOnly set (an error)
    await s.createApp("myapp", "debug-only-test", { dontPrepareApp: true });
    s.cd("myapp");
    run = s.run("--prepare-app");
    run.waitSecs(20);
    await run.matchErr(
      "can't have more than one of: debugOnly, prodOnly, testOnly"
    );
    await run.expectExit(1);
  }
);

// Add a package that adds files to specific client architectures.
selftest.define("add packages client archs", async function (options) {
  var runTestWithArgs = async function (clientType, args, port) {
    var s = new Sandbox({
      clients: Object.assign(options.clients, { port: port }),
    });
    await s.init();

    // Starting a run
    await s.createApp("myapp", "package-tests");
    s.cd("myapp");
    s.set("METEOR_OFFLINE_CATALOG", "t");

    var outerRun = s.run("add", "say-something-client-targets");
    await outerRun.match(/say-something-client-targets.*added,/);
    await outerRun.expectExit(0);
    await checkPackages(s, ["meteor-base", "say-something-client-targets"]);

    await s.testWithAllClients(
      async function (run) {
        var expectedLogNum = 0;
        run.waitSecs(10);
        await run.match("myapp");
        await run.match("proxy");
        run.waitSecs(10);
        await run.match("running at");
        await run.match("localhost");

        run.connectClient();
        run.waitSecs(40);
        await run.match("all clients " + expectedLogNum++);
        await run.match(clientType + " client " + expectedLogNum++);
        await run.stop();
      },
      {
        args,
        testName: "add packages client archs",
        testFile: "package-tests.js",
      }
    );
  };

  await runTestWithArgs("browser", [], 3000);
});

selftest.define("add package with no builds", ["net"], async function () {
  var s = new Sandbox();
  await s.init();

  // This depends on glasser:binary-package-with-no-builds@1.0.0 existing with
  // no published builds.

  await s.createApp("myapp", "empty");
  s.cd("myapp");

  var run = s.run("add", "glasser:binary-package-with-no-builds");
  run.waitSecs(10);
  await run.matchErr("glasser:binary-package-with-no-builds@1.0.0");
  await run.matchErr("No compatible binary build found");
  await run.expectExit(1);
});

selftest.define(
  "package skeleton creates correct versionsFrom",
  ["custom-warehouse"],
  async function () {
    var s = new Sandbox({ warehouse: { v1: { recommended: true } } });
    await s.init();

    var token = utils.randomToken();
    var fullPackageName = "test:" + token;
    var fsPackageName = token;

    var run = s.run("create", "--package", fullPackageName);
    run.waitSecs(15);
    await run.match(fullPackageName);
    await run.expectExit(0);

    s.cd(fsPackageName);
    var packageJs = s.read("package.js");
    if (!packageJs.match(/api.versionsFrom\('v1'\);/)) {
      selftest.fail(
        "package.js missing correct 'api.versionsFrom':\n" + packageJs
      );
    }
  }
);

selftest.define("show unknown version of package", async function () {
  var s = new Sandbox();
  await s.init();

  // This version doesn't exist and is unlikely to exist.
  var run = s.run("show", "meteor-base@0.123.456");
  run.waitSecs(5);
  await run.matchErr("meteor-base@0.123.456: not found");
  await run.expectExit(1);
});

selftest.define("circular dependency errors", async function () {
  var s = new Sandbox();
  await s.init();

  // meteor add refreshes, but we don't need anything from the official catalog
  // here.
  s.set("METEOR_OFFLINE_CATALOG", "t");
  var run;

  // This app contains some pairs of packages with circular dependencies The app
  // currently *uses* no packages, so it can be created successfully.
  await s.createApp("myapp", "circular-deps");
  s.cd("myapp");

  // Try to add one of a pair of circularly-depending packages. See an error.
  run = s.run("add", "first");
  await run.matchErr("error: circular dependency");
  await run.expectExit(1);

  // Note that the app still builds fine because 'first' didn't actually get
  // added.
  run = s.run("--prepare-app");
  await run.expectExit(0);

  // This pair has first-imply uses second-imply, second-imply implies
  // first-imply.
  run = s.run("add", "first-imply");
  await run.matchErr("error: circular dependency");
  await run.expectExit(1);

  // This pair has first-weak uses second-weak, second-weak uses first-weak
  // weakly.  Currently, it's possible to add a weak cycle to an app (ie, the
  // prepare-app step passes), but not to run the bundler. We don't want to
  // write a test that prevents us from making the weak cycle an error at
  // prepare-time, so let's skip straight to bundling.
  s.write(".meteor/packages", "first-weak");
  run = s.run("--once");
  await run.matchErr("error: circular dependency");
  await run.expectExit(254);

  // ... but we can add second-weak, which just doesn't pull in first-weak at
  // all.
  s.write(".meteor/packages", "second-weak");
  run = s.run("--once");
  await run.match(/first-weak.*removed from your project/);
  await run.expectExit(123); // the app immediately calls process.exit(123)

  // This pair has first-unordered uses second-unordered, second-unordered uses
  // first-unordered unorderedly.  This should work just fine: that's why
  // unordered exists!
  s.write(".meteor/packages", "first-unordered");
  run = s.run("--once");
  await run.match(/first-unordered.*added/);
  await run.match(/second-unordered.*added/);
  await run.match(/second-weak.*removed from your project/);
  await run.expectExit(123); // the app immediately calls process.exit(123)
});

// Runs 'meteor show <fullPackageName>' without a specified version and checks
// that the output is correct.
//
// - s: sandbox in which to run commands
// - fullPackageName: name of the package to show.
// - options:
//   - summary: Expected summary of the latest version.
//   - description: longform description of the latest version
//   - maintainers: the string of maintainers
//   - homepage: Homepage url, if one was set.
//   - git:  Git url, if one was set.
//   - exports: exports string
//   - implies: implies string
//   - defaultVersion: version that git/exports/etc come from
//   - versions: array of objects representing versions that we have
//     published, with keys:
//     - version: version number (ex: 0.9.9)
//     - date: string we expect to see as the date.
//     - label: string that we expect to see as the label. (ex: "installed")
//   - addendum: a message to display at the bottom.
//   - all: run 'meteor show' with the 'show-all' option.
var testShowPackage = selftest.markStack(async function (
  s,
  fullPackageName,
  options
) {
  var run;
  if (options.all) {
    run = s.run("show", "--show-all", fullPackageName);
  } else {
    run = s.run("show", fullPackageName);
  }
  var packageName = options.defaultVersion
    ? fullPackageName + "@" + options.defaultVersion
    : fullPackageName;
  await run.match("Package: " + packageName + "\n");
  if (options.homepage) {
    await run.read("Homepage: " + options.homepage + "\n");
  }
  if (options.maintainers) {
    await run.read("Maintainers: " + options.maintainers + "\n");
  }
  if (options.git) {
    await run.read("Git: " + options.git + "\n");
  }
  if (options.exports) {
    await run.read("Exports: " + options.exports + "\n");
  }
  if (options.implies) {
    await run.read("Implies: " + options.implies + "\n");
  }
  await run.read("\n");
  if (_.has(options, "description")) {
    await run.read(options.description + "\n");
  } else if (_.has(options, "summary")) {
    await run.read(options.summary + "\n");
  }
  if (options.versions) {
    if (options.all) {
      await run.match("Versions:");
    } else {
      await run.match("Recent versions:");
    }
    for (const version of options.versions) {
      await run.match(version.version);
      if (version.directory) {
        await run.match(version.directory + "\n");
      } else {
        await run.match(version.date);
        if (version.label) {
          await run.match(version.label + "\n");
        } else {
          await run.match("\n");
        }
      }
    }
    await run.read("\n");
  }
  if (options.addendum) {
    await run.read(options.addendum);
  }
  await run.expectExit(0);
});

// Runs 'meteor show <name>@<version> and checks that the output is correct.
//
// - s: sandbox
// - options:
//  - packageName: name of the package.
//  - version: version string.
//  - summary: summary string of the package.
//  - description: long-form description of the package
//  - publishedBy: username of the publisher.
//  - publishedOn: string of the publication time.
//  - git: (optional) URL of the git repository.
//  - dependencies: (optional) an array of objects representing dependencies:
//    - name: package name
//    - constraint: constraint, such as "1.0.0" or "=1.0.0" or null.
//    - weak: true if this is a weak dependency.
//  - addendum: a message that we expect to display at the very bottom.
var testShowPackageVersion = selftest.markStack(async function (s, options) {
  var name = options.packageName;
  var version = options.version;
  var run = s.run("show", name + "@" + version);
  await run.match("Package: " + name + "@" + version + "\n");
  if (options.directory) {
    await run.match("Directory: " + options.directory + "\n");
  }
  if (options.exports) {
    await run.read("Exports: " + options.exports + "\n");
  }
  if (options.implies) {
    await run.read("Implies: " + options.implies + "\n");
  }
  if (options.git) {
    await run.match("Git: " + options.git + "\n");
  }
  if (_.has(options, "description")) {
    await run.read("\n");
    await run.read(options.description + "\n");
  } else if (_.has(options, "summary")) {
    await run.read("\n");
    await run.read(options.summary + "\n");
  }
  if (options.dependencies) {
    await run.read("\n");
    await run.read("Depends on:\n");
    // Use 'read' to ensure that these are the only dependencies listed.
    for (const dep of options.dependencies) {
      var depStr = dep.name;
      if (dep.constraint) {
        depStr += "@" + dep.constraint;
      }
      if (dep.weak) {
        depStr += " (weak dependency)";
      }
      await run.read("  " + depStr + "\n");
    }
  }
  if (options.publishedBy) {
    await run.match("\n");
    await run.match(
      "Published by " +
        options.publishedBy +
        " on " +
        options.publishedOn +
        ".\n"
    );
  }
  if (options.addendum) {
    await run.read("\n" + options.addendum + "\n");
  }
  // Make sure that we exit without printing anything else.
  await run.expectEnd(0);
});

// For local packages without a version, we want to replace version information
// with the string "local". We also want to make sure that querying for
// 'name@local' gives that local version.
selftest.define("show local package w/o version", async function () {
  var s = new Sandbox();
  await s.init();

  var name = "my-local-package" + utils.randomToken();

  // Create a package without version or summary; check that we can show its
  // information without crashing.
  await s.createPackage(name, name, "package-for-show");
  var packageDir = files.pathJoin(s.root, "home", name);

  await s.cd(name, async function () {
    s.cp("package-completely-empty.js", "package.js");
    await testShowPackage(s, name, {
      defaultVersion: "local",
      versions: [{ version: "local", directory: packageDir }],
    });

    await testShowPackageVersion(s, {
      packageName: name,
      version: "local",
      directory: packageDir,
    });

    // Test that running without any arguments also shows this package.
    var run = s.run("show");
    await run.match("Package: " + name + "@local\n");
    await run.match("Directory: " + packageDir + "\n");
    await run.expectExit(0);
  });

  // Test that running without any arguments outside of a package does not
  // work.
  var run = s.run("show");
  await run.matchErr("specify a package or release name");
  await run.expectExit(1);
});

// Make sure that a local-only package shows up correctly in show and search
// results.
selftest.define("show and search local package", async function () {
  // Setup: create an app, containing a package. This local package should show
  // up in the results of `meteor show` and `meteor search`.
  var s = new Sandbox();
  await s.init();

  var name = "my-local-package" + utils.randomToken();
  await s.createApp("myapp", "empty");
  s.cd("myapp");
  s.mkdir("packages");
  await s.cd("packages", function () {
    return s.createPackage(name, name, "package-for-show");
  });

  var packageDir = files.pathJoin(s.root, "home", "myapp", "packages", name);
  s.cd(packageDir, function () {
    s.cp("package-with-git.js", "package.js");
  });

  var summary = "This is a test package";
  // Run `meteor show`, but don't add the package to the app yet. We should know
  // that the package exists, even though it hasn't been added to the app.
  await testShowPackage(s, name, {
    summary: summary,
    defaultVersion: "local",
    git: "www.github.com/meteor/meteor",
    versions: [{ version: "1.0.0", directory: packageDir }],
  });

  // Add the package to the app.
  var run = s.run("add", name);
  run.waitSecs(5);
  await run.expectExit(0);
  await testShowPackage(s, name, {
    summary: summary,
    git: "www.github.com/meteor/meteor",
    defaultVersion: "local",
    versions: [{ version: "1.0.0", directory: packageDir }],
  });

  // When we run `meteor search`, we should be able to see the results for this
  // package, even though it does not exist on the server.
  run = s.run("search", name);
  run.waitSecs(15);
  await run.match(name);
  await run.match("You can use");
  await run.expectExit(0);

  // We can see exports on local packages.
  s.cd("packages");
  summary = "This is a test package";
  name = "my-local-exports";
  packageDir = files.pathJoin(s.root, "home", "myapp", "packages", name);
  await s.createPackage(name, name, "package-for-show");
  s.cd(name, function () {
    s.cp("package-with-exports.js", "package.js");
  });

  const impRaw = {
    A: "",
    B: "server",
    C: "web.browser, web.browser.legacy, web.cordova",
    D: "web.browser, web.browser.legacy",
    E: "web.cordova",
    G: "server, web.cordova",
  };

  const exportStr = Object.keys(impRaw)
    .map((key) => {
      const value = impRaw[key];
      return key + (value ? " (" + value + ")" : "");
    })
    .join(", ");

  var description = "Test package.";

  await testShowPackage(s, name, {
    summary: summary,
    git: "www.github.com/meteor/meteor",
    exports: exportStr,
    description: description,
    defaultVersion: "local",
    versions: [{ version: "1.0.1", directory: packageDir }],
  });
  await testShowPackageVersion(s, {
    packageName: name,
    version: "1.0.1",
    directory: packageDir,
    git: "www.github.com/meteor/meteor",
    summary: summary,
    exports: exportStr,
    description: description,
  });

  // Test showing implies. Since we are not going to build the package, we don't
  // have to publish any of the things that we imply.
  var impliesData = _.sortBy(
    _.map(impRaw, function (label, placeholder) {
      var name = randomizedPackageName(username, placeholder.toLowerCase());
      return { placeholder: placeholder, name: name, label: label };
    }),
    "name"
  );
  s.cd(name, function () {
    s.cp("package-with-implies.js", "package.js");
    var packOpen = s.read("package.js");
    _.each(impliesData, function (d) {
      var repReg = new RegExp("~" + d.placeholder + "~", "g");
      packOpen = packOpen.replace(repReg, d.name);
    });
    s.write("package.js", packOpen);
  });

  summary = "This is a test package";
  description = "Test package.";
  var impArr = _.map(impliesData, function (d) {
    return d.label ? d.name + " (" + d.label + ")" : d.name;
  });
  var impStr =
    impArr[0] +
    ", " +
    impArr[1] +
    ", " +
    impArr[2] +
    ", " +
    impArr[3] +
    ", " +
    impArr[4] +
    ", " +
    impArr[5];

  await testShowPackage(s, name, {
    summary: summary,
    description: description,
    implies: impStr,
    directory: packageDir,
    defaultVersion: "local",
    git: "www.github.com/meteor/meteor",
    versions: [{ version: "1.2.1", directory: packageDir }],
  });

  // Implies are also dependencies.
  var deps = _.map(impliesData, function (d) {
    return { name: d.name, constraint: "1.0.0" };
  });
  await testShowPackageVersion(s, {
    packageName: name,
    version: "1.2.1",
    directory: packageDir,
    description: description,
    summary: summary,
    git: "www.github.com/meteor/meteor",
    implies: impStr,
    dependencies: deps,
  });
});

// This tests that we get the right excerpt out of the Readme.md in different
// combinations. It doesn't test publication, because publishing is slow --
// that's covered in a different test.
selftest.define("show readme excerpt", async function () {
  var s = new Sandbox();
  await s.init();

  var name = "my-local-package" + utils.randomToken();

  // Create a package without version or summary; check that we can show its
  // information without crashing.
  await s.createPackage(name, name, "package-for-show");
  var packageDir = files.pathJoin(s.root, "home", name);

  // We are just going to change the description in the Readme. Some things
  // about this package are not going to change, and our test will be more
  // legible to factor them out here.
  var basePackageInfo = {
    summary: "This is a test package",
    defaultVersion: "local",
    versions: [{ version: "0.9.9", directory: packageDir }],
  };
  var baseVersionInfo = {
    summary: "This is a test package",
    packageName: name,
    version: "0.9.9",
    directory: packageDir,
  };

  s.cd(name);

  // By default, we will use the README.md file for documentation.
  // Start with a blank file. Nothing should show up!
  s.write("README.md", "");
  await testShowPackage(s, name, basePackageInfo);
  await testShowPackageVersion(s, baseVersionInfo);

  // An example of a standard readme.
  var readme =
    "Heading" +
    "\n" +
    "========" +
    "\n" +
    "foobar1" +
    "\n" +
    "\n" +
    "## Subheading" +
    "\n" +
    "You should not see this line!";
  s.write("README.md", readme);
  await testShowPackage(
    s,
    name,
    Object.assign({ description: "foobar1" }, basePackageInfo)
  );
  await testShowPackageVersion(
    s,
    Object.assign({ description: "foobar1" }, baseVersionInfo)
  );

  // Another example -- we have hidden the excerpt under a different subheading.
  readme =
    "Heading" +
    "\n" +
    "========" +
    "\n" +
    "## Subheading" +
    "\n" +
    "foobar2" +
    "\n" +
    "## Another subheading" +
    "\n" +
    "You should not see this line!";
  s.write("README.md", readme);
  await testShowPackage(
    s,
    name,
    Object.assign({ description: "foobar2" }, basePackageInfo)
  );
  await testShowPackageVersion(
    s,
    Object.assign({ description: "foobar2" }, baseVersionInfo)
  );

  // Generally, people skip a line between the header and the text, and
  // sometimes, even between headers. (It is part of markdown, in fact.) Let's
  // make sure that we handle that correctly.
  readme =
    "Heading" +
    "\n" +
    "========" +
    "\n" +
    "\n" +
    "## Subheading" +
    "\n" +
    "\n" +
    "foobaz" +
    "\n" +
    "\n" +
    "## Another subheading" +
    "\n" +
    "\n" +
    "You should not see this line!";
  s.write("README.md", readme);
  await testShowPackage(
    s,
    name,
    Object.assign({ description: "foobaz" }, basePackageInfo)
  );
  await testShowPackageVersion(
    s,
    Object.assign({ description: "foobaz" }, baseVersionInfo)
  );

  // Some formatting in the text.
  var excerpt = "Here is a code sample:" + "\n\n" + "```foobar and foobar```";
  readme =
    "Heading" +
    "\n" +
    "========" +
    "\n" +
    "\n" +
    excerpt +
    "\n\n" +
    "# Subheading" +
    "\n" +
    "\n" +
    "## Another subheading" +
    "\n" +
    "\n" +
    "You should not see this line!";
  s.write("README.md", readme);
  await testShowPackage(
    s,
    name,
    Object.assign({ description: excerpt }, basePackageInfo)
  );
  await testShowPackageVersion(
    s,
    Object.assign({ description: excerpt }, baseVersionInfo)
  );

  // Now, let's try different file specifications for the documentation.
  var git = "https:ilovegit.git";
  var summary = "Test summary";
  var staging = s.read("package-customizable.js");
  staging = staging.replace(/~version~/g, "1.0.0");
  staging = staging.replace(/~git~/g, git);
  staging = staging.replace(/~summary~/g, summary);

  // If we specify null, we have no docs.
  s.write("package.js", staging.replace(/~documentation~/g, "null"));
  baseVersionInfo = {
    summary: summary,
    git: git,
    packageName: name,
    version: "1.0.0",
    directory: packageDir,
  };
  basePackageInfo = {
    git: git,
    summary: summary,
    defaultVersion: "local",
    versions: [{ version: "1.0.0", directory: packageDir }],
  };
  await testShowPackageVersion(s, baseVersionInfo);
  await testShowPackage(s, name, basePackageInfo);

  // If we specify a different file, read that file.
  s.write(
    "package.js",
    staging.replace(/~documentation~/g, "'Meteor-Readme.md'")
  );
  readme = "A special Readme, just for Meteor.";
  s.write("Meteor-Readme.md", "Title\n==\n" + readme);
  await testShowPackageVersion(
    s,
    Object.assign({ description: readme }, baseVersionInfo)
  );
  await testShowPackage(
    s,
    name,
    Object.assign({ description: readme }, basePackageInfo)
  );

  // If we specify a non-existent file, tell us.
  s.write("package.js", staging.replace(/~documentation~/g, "'NOTHING'"));
  var run = s.run("show", name);
  await run.matchErr("Documentation not found");
  await run.expectExit(1);
  run = s.run("show", name + "@1.0.0");
  await run.matchErr("Documentation not found");
  await run.expectExit(1);
});

selftest.define("tilde version constraints", [], async function () {
  var s = new Sandbox();
  await s.init();

  s.set("METEOR_WATCH_PRIORITIZE_CHANGED", "false");

  await s.createApp("tilde-app", "package-tests");
  s.cd("tilde-app");

  var run = s.run();

  await run.match("tilde-app");
  await run.match("proxy");
  run.waitSecs(10);
  await run.match("your app");
  run.waitSecs(10);
  await run.match("running at");
  run.waitSecs(60);

  var packages = s.read(".meteor/packages").replace(/\n*$/m, "\n");

  function setTopLevelConstraint(constraint) {
    s.write(
      ".meteor/packages",
      packages +
        "tilde-constraints" +
        (constraint ? "@" + constraint : "") +
        "\n"
    );
  }

  setTopLevelConstraint("");
  await run.match(/tilde-constraints.*added, version 0\.4\.2/);
  await run.match("tilde-constraints.js");
  run.waitSecs(10);

  setTopLevelConstraint("0.4.0");
  await run.match("tilde-constraints.js");
  await run.match("server restarted");
  run.waitSecs(10);

  setTopLevelConstraint("~0.4.0");
  await run.match("tilde-constraints.js");
  await run.match("server restarted");
  run.waitSecs(10);

  setTopLevelConstraint("0.4.3");
  await run.match(
    "error: No version of tilde-constraints satisfies all constraints"
  );
  run.waitSecs(10);

  setTopLevelConstraint("~0.4.3");
  await run.match(
    "error: No version of tilde-constraints satisfies all constraints"
  );
  run.waitSecs(10);

  setTopLevelConstraint("0.3.0");
  await run.match("tilde-constraints.js");
  await run.match("server restarted");
  run.waitSecs(10);

  setTopLevelConstraint("~0.3.0");
  await run.match(
    "error: No version of tilde-constraints satisfies all constraints"
  );
  run.waitSecs(10);

  setTopLevelConstraint("0.5.0");
  await run.match(
    "error: No version of tilde-constraints satisfies all constraints"
  );
  run.waitSecs(10);

  setTopLevelConstraint("~0.5.0");
  await run.match(
    "error: No version of tilde-constraints satisfies all constraints"
  );
  run.waitSecs(10);

  s.write(".meteor/packages", packages);
  await run.match(/tilde-constraints.*removed/);
  run.waitSecs(10);

  s.write(".meteor/packages", packages + "tilde-dependent\n");
  await run.match(/tilde-constraints.*added, version 0\.4\.2/);
  await run.match(/tilde-dependent.*added, version 0\.1\.0/);
  await run.match("tilde-constraints.js");
  await run.match("tilde-dependent.js");
  run.waitSecs(10);

  var depPackageJsPath = "packages/tilde-dependent/package.js";
  var depPackageJs = s.read(depPackageJsPath);

  function setDepConstraint(constraint) {
    s.write(
      depPackageJsPath,
      depPackageJs.replace(
        /tilde-constraints[^"]*/g, // Syntax highlighting hack: "
        "tilde-constraints" + (constraint ? "@" + constraint : "")
      )
    );
  }

  setDepConstraint("0.4.0");
  await run.match("tilde-constraints.js");
  await run.match("tilde-dependent.js");
  await run.match("server restarted");
  run.waitSecs(10);

  setDepConstraint("~0.4.0");
  await run.match("tilde-constraints.js");
  await run.match("tilde-dependent.js");
  await run.match("server restarted");
  run.waitSecs(10);

  setDepConstraint("0.3.0");
  await run.match("tilde-constraints.js");
  await run.match("tilde-dependent.js");
  await run.match("server restarted");
  run.waitSecs(10);

  // TODO The rest of these tests should cause version conflicts, but it
  // seems like version constraints between local packages are ignored,
  // which is a larger (preexisting) problem we should investigate.
  /*
  setDepConstraint("=0.4.0");
  await run.match("error: No version of tilde-constraints satisfies all constraints");
  run.waitSecs(10);

  setDepConstraint("~0.3.0");
  await run.match("error: No version of tilde-constraints satisfies all constraints");
  run.waitSecs(10);

  setDepConstraint("0.4.3");
  await run.match("error: No version of tilde-constraints satisfies all constraints");
  run.waitSecs(10);

  setDepConstraint("~0.4.3");
  await run.match("error: No version of tilde-constraints satisfies all constraints");
  run.waitSecs(10);
  */

  await run.stop();
});

selftest.define("override version constraints", [], async function () {
  var s = new Sandbox();
  await s.init();

  // The constraint solver avoids re-solving everything from scratch on
  // rebuilds if the current input of top-level constraints matches the
  // previously solved input (also just top-level constraints). This is
  // slightly unsound, because non-top-level dependency constraints might
  // have changed, but it's important for performance, and relatively
  // harmless in practice (if there's a version conflict, you'll find out
  // about it the next time you do a full restart of the development
  // server). The unsoundness causes problems for this test, however, and
  // since we're not testing the caching functionality here, we set this
  // environment variable to disable the caching completely.
  s.set("METEOR_DISABLE_CONSTRAINT_SOLVER_CACHING", "true");

  await s.createApp("override-app", "package-tests");
  s.cd("override-app");

  var run = s.run();

  await run.match("override-app");
  await run.match("proxy");
  run.waitSecs(10);
  await run.match("your app");
  run.waitSecs(10);
  await run.match("running at");
  run.waitSecs(60);

  let packages = s.read(".meteor/packages").replace(/\n*$/m, "\n");

  function setTopLevelConstraint(constraint) {
    s.write(
      ".meteor/packages",
      packages +
        "override-constraints" +
        (constraint ? "@" + constraint : "") +
        "\n"
    );
  }

  async function checkRestarted() {
    await run.match("override-constraints.js");
    await run.match("server restarted");
    run.waitSecs(10);
  }

  setTopLevelConstraint("");
  await run.match(/override-constraints.*added, version 1\.5\.3/);
  await checkRestarted();

  setTopLevelConstraint("1.4.0");
  await checkRestarted();

  setTopLevelConstraint("1.4.0!");
  await checkRestarted();

  setTopLevelConstraint("=1.5.3");
  await checkRestarted();

  setTopLevelConstraint("=1.5.3!");
  await checkRestarted();

  async function checkNoSatisfyingVersion() {
    await run.match(
      "error: No version of override-constraints satisfies all constraints"
    );
    run.waitSecs(10);
  }

  setTopLevelConstraint("~1.4.0");
  await checkNoSatisfyingVersion();

  setTopLevelConstraint("~1.4.0!");
  await checkNoSatisfyingVersion();

  setTopLevelConstraint("1.6.0");
  await checkNoSatisfyingVersion();

  setTopLevelConstraint("1.6.0!");
  await checkNoSatisfyingVersion();

  setTopLevelConstraint("1.5.4");
  await checkNoSatisfyingVersion();

  setTopLevelConstraint("1.5.4!");
  await checkNoSatisfyingVersion();

  setTopLevelConstraint("~1.4.0||=1.5.3");
  await checkRestarted();

  setTopLevelConstraint("~1.4.0||=1.5.3!");
  await checkRestarted();

  // The ! applies to the whole || disjunction, not just the rightmost
  // individual constraint (~1.4.0). This would fail if ~1.4.0 won.
  setTopLevelConstraint("1.5.0||~1.4.0!");
  await checkRestarted();

  // Different major versions, but at least one of them works.
  setTopLevelConstraint("1.5.0||0.4.0!");
  await checkRestarted();

  async function checkInvalidConstraint() {
    await run.match(".meteor/packages: Invalid constraint string");
    run.waitSecs(10);
  }

  setTopLevelConstraint("!");
  await checkInvalidConstraint();

  // Reset to something that works in between invalid tests.
  setTopLevelConstraint("1.5.3");
  await checkRestarted();

  async function checkInvalidSemver() {
    await run.match(".meteor/packages: Version string must look like semver");
    run.waitSecs(10);
  }

  setTopLevelConstraint("5!");
  await checkInvalidSemver();

  // Reset to something that works in between invalid tests.
  setTopLevelConstraint("1.5.3");
  await checkRestarted();

  setTopLevelConstraint("1.5!");
  await checkInvalidSemver();

  // Add the conflicting package.
  packages += "override-conflicts@1.0.0\n";
  setTopLevelConstraint("1.5.3");
  await run.match(/override-conflicts.*added, version 1\.0\.1/);
  await run.match("override-conflicts.js");
  await checkRestarted();

  const conflictingPackageJs = s.read("packages/override-conflicts/package.js");

  function setConflictingConstraint(statement) {
    s.write(
      "packages/override-conflicts/package.js",
      conflictingPackageJs.replace("// PLACEHOLDER", statement)
    );
  }

  setConflictingConstraint('api.use("override-constraints");');
  await checkRestarted();

  setConflictingConstraint('api.use("override-constraints@1.5.0");');
  await checkRestarted();

  setConflictingConstraint('api.imply("override-constraints@1.5.0");');
  await checkRestarted();

  setConflictingConstraint('api.use("override-constraints@=1.4.0");');
  await run.match(
    "Constraint override-constraints@=1.4.0 is not satisfied by " +
      "override-constraints 1.5.3"
  );
  run.waitSecs(10);

  setTopLevelConstraint("1.5.0!");
  await checkRestarted();

  // Constraints imposed elsewhere are still enforced as minimums, so the
  // @1.5.0! override syntax can't do anything about this constraint:
  setConflictingConstraint('api.use("override-constraints@1.6.0");');
  await run.match(
    "Constraint override-constraints@1.6.0 is not satisfied by " +
      "override-constraints 1.5.3"
  );
  run.waitSecs(10);

  setConflictingConstraint('api.use("override-constraints@1.5.0");');
  await checkRestarted();

  setTopLevelConstraint("1.5.3");
  await checkRestarted();

  setConflictingConstraint('api.use("override-constraints@0.9.0");');
  await run.match(
    "Constraint override-constraints@0.9.0 is not satisfied by " +
      "override-constraints 1.5.3"
  );
  run.waitSecs(10);

  setTopLevelConstraint("0.9.0||1.5.3");
  await run.match(
    "Constraint override-constraints@0.9.0 is not satisfied by " +
      "override-constraints 1.5.3"
  );
  run.waitSecs(10);

  setTopLevelConstraint("1.4.0!");
  await checkRestarted();

  setTopLevelConstraint("~1.5.0!");
  await checkRestarted();

  setTopLevelConstraint("=1.5.3!");
  await checkRestarted();

  setTopLevelConstraint("1.5.3");
  await run.match(
    "Constraint override-constraints@0.9.0 is not satisfied by " +
      "override-constraints 1.5.3"
  );
  run.waitSecs(10);

  setTopLevelConstraint("");
  await run.match(
    "Constraint override-constraints@0.9.0 is not satisfied by " +
      "override-constraints 1.5.3"
  );
  run.waitSecs(10);

  setConflictingConstraint("// PLACEHOLDER");
  await checkRestarted();

  await run.stop();
});
