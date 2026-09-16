require("../../tool-env/install-babel.js");

var _ = require("underscore");
var assert = require("assert");
var bundler = require("../../isobuild/bundler.js");
var release = require("../../packaging/release.js");
var files = require("../../fs/files");
var catalog = require("../../packaging/catalog/catalog.js");
var buildmessage = require("../../utils/buildmessage.js");
var meteorNpm = require("../../isobuild/meteor-npm.js");
var isopackets = require("../../tool-env/isopackets.js");
var projectContextModule = require("../../project-context.js");
var safeWatcher = require("../../fs/safe-watcher");
const { makeGlobalAsyncLocalStorage } = require("../../utils/fiber-helpers");

var lastTmpDir = null;
var tmpDir = function () {
  return (lastTmpDir = files.mkdtemp());
};

var makeProjectContext = async function (appName) {
  var projectDir = files.mkdtemp("test-bundler-devdepends");
  await files.cp_r(
    files.pathJoin(files.convertToStandardPath(__dirname), appName),
    projectDir,
    { preserveSymlinks: true }
  );
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: projectDir,
  });
  await doOrThrow(async function () {
    await projectContext.prepareProjectForBuild();
  });

  return projectContext;
};

var doOrThrow = async function (f) {
  var ret;
  var messages = await buildmessage.capture(async function () {
    ret = await f();
  });
  if (messages.hasMessages()) {
    throw Error(messages.formatMessages());
  }
  return ret;
};

var getTestPackageDir = function (projectContext) {
  return files.pathJoin(projectContext.projectDir, "packages", "test-package");
};

var reloadPackages = async function (projectContext) {
  projectContext.reset();
  await doOrThrow(async function () {
    await projectContext.prepareProjectForBuild();
  });
};

var updateTestPackageWithDevDepends = async function (
  projectContext,
  npmDependencies,
  npmDevDependencies,
  options
) {
  options = options || {};
  files.writeFile(
    files.pathJoin(getTestPackageDir(projectContext), "package.js"),
    "Package.describe({version: '1.0.0'});\n" +
      "\n" +
      "Npm.depends(" +
      JSON.stringify(npmDependencies) +
      ");" +
      "\n" +
      "Npm.devDepends(" +
      JSON.stringify(npmDevDependencies) +
      ");" +
      "\n" +
      "Package.onUse(function (api) { api.addFiles('dummy.js', 'server'); });"
  );
  if (!options.noReload) await reloadPackages(projectContext);
};

///
/// HELPERS
///

var _assertCorrectPackageNpmDir = function (projectContext, deps, context = 'package') {
  // test-package/.npm was generated

  // Get the actual npm-shrinkwrap.json content
  var actualShrinkwrapContent = JSON.parse(
    files.readFile(
      files.pathJoin(
        getTestPackageDir(projectContext),
        ".npm",
        context,
        "npm-shrinkwrap.json"
      ),
      "utf8"
    )
  );
  var actualMeteorNpmShrinkwrapDependencies =
    actualShrinkwrapContent.dependencies;

  // Instead of comparing the entire JSON string, we'll verify that each expected dependency
  // exists in the actual dependencies with the correct version
  _.each(deps, function (version, name) {
    // Check that the dependency exists
    assert(
      actualMeteorNpmShrinkwrapDependencies[name],
      `Dependency ${name} not found in npm-shrinkwrap.json`
    );

    // Check that the version matches
    if (!/tarball/.test(version)) {
      assert.equal(
        actualMeteorNpmShrinkwrapDependencies[name].version,
        version,
        `Expected version ${version} for ${name}, but got ${actualMeteorNpmShrinkwrapDependencies[name].version}`
      );
    }
  });

  // Check that there are no extra dependencies
  var actualDependencyNames = Object.keys(
    actualMeteorNpmShrinkwrapDependencies
  );
  var expectedDependencyNames = Object.keys(deps);

  assert.equal(
    actualDependencyNames.length,
    expectedDependencyNames.length,
    `Expected ${expectedDependencyNames.length} dependencies, but found ${actualDependencyNames.length}`
  );

  _.each(actualDependencyNames, function (name) {
    assert(
      name in deps,
      `Unexpected dependency ${name} found in npm-shrinkwrap.json`
    );
  });

  var testPackageDir = getTestPackageDir(projectContext);
  assert.equal(
    files.readFile(
      files.pathJoin(testPackageDir, ".npm", context, ".gitignore"),
      "utf8"
    ),
    "node_modules\n"
  );
  assert(
    files.exists(files.pathJoin(testPackageDir, ".npm", context, "README"))
  );

  // verify the contents of the `node_modules` dir
  var nodeModulesDir = files.pathJoin(
    testPackageDir,
    ".npm",
    context,
    "node_modules"
  );

  // all expected dependencies are installed correctly, with the correct version
  _.each(deps, function (version, name) {
    assert(looksInstalled(nodeModulesDir, name));

    if (!/tarball/.test(version)) {
      // 'version' in package.json from a tarball won't be correct
      assert.equal(
        JSON.parse(
          files.readFile(
            files.pathJoin(nodeModulesDir, name, "package.json"),
            "utf8"
          )
        ).version,
        version
      );
    }
  });

  // all installed dependencies were expected to be found there,
  // meaning we correctly removed unused node_modules directories
  _.each(files.readdir(nodeModulesDir), function (installedNodeModule) {
    // Skip files that are not directories
    if (
      !files
        .stat(files.pathJoin(nodeModulesDir, installedNodeModule))
        .isDirectory()
    ) {
      return;
    }

    if (
      files.exists(
        files.pathJoin(nodeModulesDir, installedNodeModule, "package.json")
      )
    )
      assert(installedNodeModule in deps);
  });
};

var _assertCorrectBundleNpmContents = function (bundleDir, deps) {
  // sanity check -- main.js has expected contents.
  assert.strictEqual(
    files.readFile(files.pathJoin(bundleDir, "main.js"), "utf8"),
    bundler._mainJsContents
  );

  // Use the default path for the node_modules directory
  var bundledPackageNodeModulesDir = files.pathJoin(
    bundleDir,
    "programs",
    "server",
    "npm",
    "node_modules",
    "meteor",
    "test-package",
    "node_modules"
  );

  // Check that all expected dependencies are in the bundle
  _.each(deps, function (version, name) {
    // Verify the dependency is installed
    assert(
      looksInstalled(bundledPackageNodeModulesDir, name),
      `Dependency ${name} not found in the bundle`
    );

    // Check version if not a tarball
    if (!/tarball/.test(version)) {
      var packageJson = JSON.parse(
        files.readFile(
          files.pathJoin(bundledPackageNodeModulesDir, name, "package.json"),
          "utf8"
        )
      );

      assert.equal(
        packageJson.version,
        version,
        `Expected version ${version} for ${name}, but got ${packageJson.version}`
      );
    }
  });

  // Check that there are no extra dependencies in the bundle
  var installedModules = files
    .readdir(bundledPackageNodeModulesDir)
    .filter(function (module) {
      // Skip files that are not directories
      if (
        !files
          .stat(files.pathJoin(bundledPackageNodeModulesDir, module))
          .isDirectory()
      ) {
        return false;
      }
      return files.exists(
        files.pathJoin(bundledPackageNodeModulesDir, module, "package.json")
      );
    });

  _.each(installedModules, function (module) {
    assert(
      module in deps,
      `Unexpected dependency ${module} found in the bundle`
    );
  });
};

var looksInstalled = function (nodeModulesDir, name) {
  // First check if the directory exists and is actually a directory
  const packageDir = files.pathJoin(nodeModulesDir, name);
  if (!files.exists(packageDir) || !files.stat(packageDir).isDirectory()) {
    return false;
  }

  // All of the packages in this test have one of these two files, so presumably
  // if one of these files is here we have correctly installed the package.
  return (
    files.exists(files.pathJoin(packageDir, "README.md")) ||
    files.exists(files.pathJoin(packageDir, "LICENSE"))
  );
};

///
/// TESTS
///

var runTest = async function () {
  // Initialize the official catalog
  await catalog.official.initialize();

  var projectContext = await makeProjectContext("app-with-package");
  var testPackageDir = getTestPackageDir(projectContext);

  // Test development mode
  try {
    var regularDeps = { gcd: "0.0.0" };
    var devDeps = { mime: "1.2.7" };
    var allDeps = { ...regularDeps, ...devDeps }; // In dev mode, both should be installed

    // Save the original global.currentCommand
    var originalCommand = global.currentCommand;

    // Set global.currentCommand to null to simulate development mode
    global.currentCommand = null;

    await updateTestPackageWithDevDepends(projectContext, regularDeps, devDeps);
    var tmpOutputDir = tmpDir();
    var result = await bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir,
    });
    assert.strictEqual(result.errors, false, result.errors && result.errors[0]);

    // In development mode, both regular and dev dependencies should be installed
    _assertCorrectPackageNpmDir(projectContext, allDeps, 'devPackage');
    _assertCorrectBundleNpmContents(tmpOutputDir, allDeps);

    // Restore the original global.currentCommand
    global.currentCommand = originalCommand;
  } catch (e) {
    assert.fail("Development mode test failed: " + e);
  }

  // Test production mode
  projectContext = await makeProjectContext("app-with-package");
  try {
    var regularDeps = { gcd: "0.0.0" };
    var devDeps = { mime: "1.2.7" };

    // Save the original global.currentCommand
    var originalCommand = global.currentCommand;

    // Set global.currentCommand to simulate production mode (build command)
    global.currentCommand = { name: "build" };

    await updateTestPackageWithDevDepends(projectContext, regularDeps, devDeps);
    var tmpOutputDir = tmpDir();
    var result = await bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir,
      buildOptions: { minifyMode: "production", buildMode: "production" },
    });
    assert.strictEqual(result.errors, false, result.errors && result.errors[0]);

    // In production mode, only regular dependencies should be installed
    _assertCorrectPackageNpmDir(projectContext, regularDeps, 'package');
    _assertCorrectBundleNpmContents(tmpOutputDir, regularDeps);

    // Restore the original global.currentCommand
    global.currentCommand = originalCommand;
  } catch (e) {
    assert.fail("Production mode test failed: " + e);
  }

  // Test that depends can only be called once
  try {
    // Create a package.js file with depends called twice
    var testPackageDir = getTestPackageDir(projectContext);
    files.writeFile(
      files.pathJoin(testPackageDir, "package.js"),
      "Package.describe({version: '1.0.0'});\n" +
        "\n" +
        "Npm.depends({gcd: '0.0.0'});" +
        "\n" +
        "Npm.depends({mime: '1.2.7'});" +
        "\n" +
        "Package.onUse(function (api) { api.addFiles('dummy.js', 'server'); });"
    );

    // Reload packages and check for error message
    projectContext.reset();
    var messages = await buildmessage.capture(async function () {
      await projectContext.prepareProjectForBuild();
    });

    assert(messages.hasMessages());
    var job = _.find(messages.jobs, function (job) {
      return job.title.includes("test-package");
    });
    assert(job);
    assert(
      /Npm\.depends may only be called once per package/.test(
        job.messages[0].message
      )
    );
  } catch (e) {
    assert.fail("Test for 'depends can only be called once' failed: " + e);
  }

  // Test that devDepends can only be called once
  try {
    // Create a package.js file with devDepends called twice
    var testPackageDir = getTestPackageDir(projectContext);
    files.writeFile(
      files.pathJoin(testPackageDir, "package.js"),
      "Package.describe({version: '1.0.0'});\n" +
        "\n" +
        "Npm.devDepends({gcd: '0.0.0'});" +
        "\n" +
        "Npm.devDepends({mime: '1.2.7'});" +
        "\n" +
        "Package.onUse(function (api) { api.addFiles('dummy.js', 'server'); });"
    );

    // Reload packages and check for error message
    projectContext.reset();
    var messages = await buildmessage.capture(async function () {
      await projectContext.prepareProjectForBuild();
    });

    assert(messages.hasMessages());
    var job = _.find(messages.jobs, function (job) {
      return job.title.includes("test-package");
    });
    assert(job);
    assert(
      /Npm\.devDepends may only be called once per package/.test(
        job.messages[0].message
      )
    );
  } catch (e) {
    assert.fail("Test for 'devDepends can only be called once' failed: " + e);
  }
};

makeGlobalAsyncLocalStorage().run(
  { name: "test-bundler-devdepends.js" },
  async function () {
    if (!files.inCheckout()) {
      throw Error("This test doesn't support non-checkout");
    }

    release.setCurrent(await release.load(null));
    await isopackets.ensureIsopacketsLoadable();

    try {
      await runTest();
    } catch (err) {
      console.log(err.stack);
      console.log("\nBundle can be found at " + lastTmpDir);
      process.exit(1);
    }

    // Allow the process to exit normally, since optimistic file watchers
    // may be keeping the event loop busy.
    safeWatcher.closeAllWatchers();
    process.exit(0);
  }
);
