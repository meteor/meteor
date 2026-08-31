import selftest from '../tool-testing/selftest.js';
import files from '../fs/files';
import buildmessage from '../utils/buildmessage.js';
import {
  canReuseNpmShrinkwrap,
  declaredSpecMatchesInstalledVersion,
  installNpmModule,
  npmDependencyCacheIsCurrent,
} from '../isobuild/meteor-npm.js';
import * as meteorNpm from '../isobuild/meteor-npm.js';

const Sandbox = selftest.Sandbox;

const MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

const GIT_DECLARED_VERSION =
  "git+https://github.com/uNetworking/uWebSockets.js.git#v20.66.0";
const GIT_INSTALLED_RESOLVED =
  "git+ssh://git@github.com/uNetworking/uWebSockets.js.git#0123456789abcdef";
const GIT_DIFFERENT_RESOLVED =
  "git+ssh://git@github.com/uNetworking/uWebSockets.js.git#fedcba9876543210";

selftest.define("npm - git dependency cache decisions", () => {
  const declaredTree = {
    dependencies: {
      "uWebSockets.js": {
        version: "git+https://github.com/uNetworking/uWebSockets.js.git#v20.66.0",
      },
    },
  };
  const resolvedTree = {
    dependencies: {
      "uWebSockets.js": { version: "20.66.0" },
    },
  };
  const sameSourceTree = {
    dependencies: {
      "uWebSockets.js": {
        version:
          "git+ssh://git@github.com/uNetworking/uWebSockets.js.git#0123456789abcdef",
      },
    },
  };
  const differentSourceTree = {
    dependencies: {
      "uWebSockets.js": {
        version:
          "git+ssh://git@github.com/uNetworking/uWebSockets.js.git#fedcba9876543210",
      },
    },
  };
  const differentRepositoryTree = {
    dependencies: {
      "uWebSockets.js": {
        version:
          "git+https://github.com/uNetworking/different-uWebSockets.js.git#v20.66.0",
      },
    },
  };
  const pathlessRepositoryTree = {
    dependencies: {
      "uWebSockets.js": {
        version: "git+https://github.com#v20.66.0",
      },
    },
  };
  const pathlessResolvedSourceTree = {
    dependencies: {
      "uWebSockets.js": {
        version: "git+ssh://git@github.com#0123456789abcdef",
      },
    },
  };
  const mixedDeclaredTree = {
    dependencies: {
      ...declaredTree.dependencies,
      tarball: {
        version: "https://example.com/tarball-v1.0.0.tgz",
      },
    },
  };
  const mixedVersionTree = {
    dependencies: {
      ...resolvedTree.dependencies,
      tarball: { version: "1.0.0" },
    },
  };
  const mixedSourceTree = {
    dependencies: {
      ...sameSourceTree.dependencies,
      tarball: {
        version: "https://example.com/tarball-v1.0.0.tgz",
      },
    },
  };
  const registryDeclaredTree = {
    dependencies: {
      registryPackage: { version: "1.0.0" },
    },
  };
  const oldRegistrySourceTree = {
    dependencies: {
      registryPackage: {
        version: "https://registry-a.example/registry-package-1.0.0.tgz",
      },
    },
  };

  selftest.expectTrue(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#v20.66.0",
    "20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#v20.66.0",
    "20.66.1",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#main",
    "20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "https://github.com/uNetworking/uWebSockets.js/archive/v20.66.0.tar.gz",
    "20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#main#v20.66.0",
    "20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#vv20.66.0",
    "v20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://#v20.66.0",
    "20.66.0",
  ));

  selftest.expectTrue(npmDependencyCacheIsCurrent(
    declaredTree,
    sameSourceTree,
    sameSourceTree,
    resolvedTree,
    declaredTree,
  ));
  selftest.expectFalse(npmDependencyCacheIsCurrent(
    declaredTree,
    sameSourceTree,
    differentSourceTree,
    resolvedTree,
    declaredTree,
  ));
  selftest.expectFalse(npmDependencyCacheIsCurrent(
    differentRepositoryTree,
    sameSourceTree,
    sameSourceTree,
    resolvedTree,
    differentRepositoryTree,
  ));
  selftest.expectFalse(npmDependencyCacheIsCurrent(
    pathlessRepositoryTree,
    pathlessResolvedSourceTree,
    pathlessResolvedSourceTree,
    resolvedTree,
    pathlessRepositoryTree,
  ));
  selftest.expectTrue(canReuseNpmShrinkwrap(
    declaredTree,
    sameSourceTree,
    resolvedTree,
    declaredTree,
  ));
  selftest.expectFalse(canReuseNpmShrinkwrap(
    differentRepositoryTree,
    sameSourceTree,
    resolvedTree,
    differentRepositoryTree,
  ));
  selftest.expectFalse(canReuseNpmShrinkwrap(
    pathlessRepositoryTree,
    pathlessResolvedSourceTree,
    resolvedTree,
    pathlessRepositoryTree,
  ));
  selftest.expectTrue(npmDependencyCacheIsCurrent(
    mixedDeclaredTree,
    mixedSourceTree,
    mixedSourceTree,
    mixedVersionTree,
    mixedDeclaredTree,
  ));
  selftest.expectTrue(canReuseNpmShrinkwrap(
    mixedDeclaredTree,
    mixedSourceTree,
    mixedVersionTree,
    mixedDeclaredTree,
  ));
  selftest.expectFalse(npmDependencyCacheIsCurrent(
    registryDeclaredTree,
    oldRegistrySourceTree,
    oldRegistrySourceTree,
    registryDeclaredTree,
    registryDeclaredTree,
  ));
  selftest.expectFalse(canReuseNpmShrinkwrap(
    registryDeclaredTree,
    oldRegistrySourceTree,
    registryDeclaredTree,
    registryDeclaredTree,
  ));
  const malformedDeclaredTree = {
    dependencies: {
      "uWebSockets.js": {
        version: "git+https://github.com/uNetworking/uWebSockets.js.git#main#v20.66.0",
      },
    },
  };
  selftest.expectFalse(npmDependencyCacheIsCurrent(
    malformedDeclaredTree,
    sameSourceTree,
    sameSourceTree,
    resolvedTree,
    malformedDeclaredTree,
  ));
  selftest.expectFalse(canReuseNpmShrinkwrap(
    malformedDeclaredTree,
    sameSourceTree,
    resolvedTree,
    malformedDeclaredTree,
  ));
});

selftest.define("npm - git dependency cache uses installed version", async () => {
  await selftest.expectEqual(await updateDependencyCache({
    declaredVersion: GIT_DECLARED_VERSION,
    installedResolved: GIT_INSTALLED_RESOLVED,
    shrinkwrapResolved: GIT_INSTALLED_RESOLVED,
    cachedDependencies: {
      "uWebSockets.js": GIT_DECLARED_VERSION,
    },
  }), {
    updated: true,
    npmCalls: [],
  });

  await selftest.expectEqual(await updateDependencyCache({
    declaredVersion: GIT_DECLARED_VERSION,
    installedResolved: GIT_INSTALLED_RESOLVED,
    shrinkwrapResolved: GIT_DIFFERENT_RESOLVED,
    cachedDependencies: {
      "uWebSockets.js": GIT_DECLARED_VERSION,
    },
  }), {
    updated: false,
    npmCalls: [["install"]],
  });
});

selftest.define("npm - dependency cache detects Git to registry changes", async () => {
  await selftest.expectEqual(await updateDependencyCache({
    declaredVersion: "20.66.0",
    installedResolved: GIT_INSTALLED_RESOLVED,
    shrinkwrapResolved: GIT_INSTALLED_RESOLVED,
    cachedDependencies: {
      "uWebSockets.js": GIT_DECLARED_VERSION,
    },
  }), {
    updated: false,
    npmCalls: [["install", "uWebSockets.js@20.66.0"]],
  });
});

selftest.define("npm - dependency cache preserves HTTPS tarballs", async () => {
  const tarball =
    "https://github.com/uNetworking/uWebSockets.js/archive/refs/tags/v20.66.0.tar.gz";

  await selftest.expectEqual(await updateDependencyCache({
    declaredVersion: tarball,
    installedResolved: tarball,
    shrinkwrapResolved: tarball,
  }), {
    updated: true,
    npmCalls: [],
  });
});

selftest.define("npm - dependency cache preserves Git SSH commits", async () => {
  await selftest.expectEqual(await updateDependencyCache({
    declaredVersion: GIT_INSTALLED_RESOLVED,
    installedResolved: GIT_INSTALLED_RESOLVED,
    shrinkwrapResolved: GIT_INSTALLED_RESOLVED,
  }), {
    updated: true,
    npmCalls: [],
  });
});

selftest.define("npm - Git tag cache requires matching provenance", async () => {
  await selftest.expectEqual(await updateDependencyCache({
    declaredVersion: GIT_DECLARED_VERSION,
    installedResolved: GIT_INSTALLED_RESOLVED,
    shrinkwrapResolved: GIT_INSTALLED_RESOLVED,
    cachedDependencies: {
      "uWebSockets.js":
        "git+https://github.com/uNetworking/uWebSockets.js.git#0123456789abcdef",
    },
  }), {
    updated: false,
    npmCalls: [["install", GIT_DECLARED_VERSION]],
  });
});

selftest.define("npm - legacy Git tag cache refreshes once", async () => {
  await selftest.expectEqual(await updateDependencyCache({
    declaredVersion: GIT_DECLARED_VERSION,
    installedResolved: GIT_INSTALLED_RESOLVED,
    shrinkwrapResolved: GIT_INSTALLED_RESOLVED,
  }), {
    updated: false,
    npmCalls: [["install", GIT_DECLARED_VERSION]],
  });
});

async function updateDependencyCache({
  declaredVersion,
  installedResolved,
  shrinkwrapResolved,
  cachedDependencies,
}) {
  const packageNpmDir = files.mkdtemp();
  const nodeModulesDir = files.pathJoin(packageNpmDir, "node_modules");

  files.mkdir(nodeModulesDir);
  files.writeFile(
    files.pathJoin(nodeModulesDir, ".node_version"),
    `${process.version.slice(0, process.version.lastIndexOf(".") + 1)}*\n`,
  );
  files.writeFile(
    files.pathJoin(nodeModulesDir, ".package-lock.json"),
    JSON.stringify({
      packages: {
        "node_modules/uWebSockets.js": {
          version: "20.66.0",
          resolved: installedResolved,
        },
      },
    }),
  );
  const shrinkwrap = {
    lockfileVersion: 4,
    dependencies: {
      "uWebSockets.js": {
        version: "20.66.0",
        resolved: shrinkwrapResolved,
      },
    },
  };
  if (cachedDependencies) {
    shrinkwrap.meteorNpmDependencies = cachedDependencies;
  }
  files.writeFile(
    files.pathJoin(packageNpmDir, "npm-shrinkwrap.json"),
    JSON.stringify(shrinkwrap),
  );

  const childProcess = require("child_process");
  const originalExecFile = childProcess.execFile;
  const npmCalls = [];
  childProcess.execFile = (...args) => {
    const commandArgs = args[1];
    const installIndex = commandArgs.indexOf("install");
    npmCalls.push(commandArgs.slice(installIndex));
    args[args.length - 1](new Error("npm install should not run"), "", "");
  };

  try {
    let updated;
    await buildmessage.capture({ title: "npm cache test" }, async () => {
      updated = await meteorNpm.updateDependencies(
        "test-package",
        packageNpmDir,
        { "uWebSockets.js": declaredVersion },
        true,
      );
    });
    return { updated, npmCalls };
  } finally {
    childProcess.execFile = originalExecFile;
    files.rm_recursive(packageNpmDir);
  }
}

selftest.define("npm", ["net"], async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  let run;

  await s.createApp("npmtestapp", "npmtest", { dontPrepareApp: true });
  s.cd("npmtestapp");

  // Ensure that we don't lose the executable bits of npm modules.
  // Regression test for https://github.com/meteor/meteor/pull/1808
  // Before this fix, the module would work on the first execution but not on a
  // subsequent one.
  for (const i of [1,2]) {
    run = s.run("--once", "--raw-logs");
    await run.tellMongo(MONGO_LISTENING);
    if (i === 1) {
      run.waitSecs(30);
      // use match instead of read because on a built release we can
      // also get an update message here.
      await run.match(
          "npm-test: updating npm dependencies -- meteor-test-executable...\n");
    }
    run.waitSecs(15);
    await run.match("null; From shell script\n");
    await run.expectExit(0);
  }

  const shrinkwrap = JSON.parse(s.read(
    "packages/npm-test/.npm/package/npm-shrinkwrap.json",
  ));
  await selftest.expectEqual(shrinkwrap.meteorNpmDependencies, {
    "meteor-test-executable": "0.0.3",
  });
});

async function testThatNpmInstallThrows(name, version, regexMatcher) {
  const tmpDir = files.convertToOSPath(files.mkdtemp());
  let didThrow = false;
  try {
    await installNpmModule(name, version, tmpDir);
  } catch (err) {
    didThrow = true;
    selftest.expectTrue(regexMatcher.test(err.message));
  }
  selftest.expectTrue(didThrow);
}

selftest.define("npm - install - messages - error installing package", ["net"], () => {
  // the 'error-prone' npm intentionally errors in the preinstall script.
  return testThatNpmInstallThrows("error-prone", "1.0.0",
    /couldn't install npm package error-prone@1.0.0/);
});

selftest.define("npm - install - messages - npm doesn't exist", ["net"], () => {
  // this test is obviously prone to sabotage.
  return testThatNpmInstallThrows("non-existant-package-gggg", "100.0.0",
    /no npm package named 'non-existant-package-gggg' in the npm registry/);
});

selftest.define("npm - install - messages - npm version doesn't exist", ["net"], () => {
  // the 'cost-of-modules' npm really exists but hopefully never this minor ver.
  return testThatNpmInstallThrows("cost-of-modules", "0.999.2",
    /cost-of-modules version 0.999.2 is not available in the npm registry/);
});
