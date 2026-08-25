import selftest from '../tool-testing/selftest.js';
import files from '../fs/files';
import buildmessage from '../utils/buildmessage.js';
import {
  batchInstallNpmModules,
  installNpmModule,
} from '../isobuild/meteor-npm.js';
import { IsopackCache, prefetchNpmDependencies } from '../isobuild/isopack-cache.js';

const Sandbox = selftest.Sandbox;

const MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

selftest.define("npm - batch install invokes npm once", async () => {
  const dir = files.mkdtemp();
  const nodeModules = files.pathJoin(dir, "node_modules");
  files.mkdir(nodeModules);
  for (const name of ["one", "two"]) {
    files.mkdir(files.pathJoin(nodeModules, name));
    files.writeFile(
      files.pathJoin(nodeModules, name, "package.json"),
      JSON.stringify({ name, version: "1.0.0" }),
    );
  }

  const childProcess = require("child_process");
  const originalExecFile = childProcess.execFile;
  const calls = [];
  childProcess.execFile = (...args) => {
    calls.push(args[1]);
    args[args.length - 1](null, "", "");
  };

  try {
    await batchInstallNpmModules({ one: "1.0.0", two: "2.0.0" }, dir);
    await selftest.expectEqual(calls, [["install", "one@1.0.0", "two@2.0.0"]]);
  } finally {
    childProcess.execFile = originalExecFile;
    files.rm_recursive(dir);
  }
});

selftest.define("npm - prefetch deduplicates directories", async () => {
  const packageMap = { _map: {
    first: { kind: 'local', packageSource: { name: 'first', npmCacheDirectory: '/a', npmDependencies: { a: '1' } } },
    twin: { kind: 'local', packageSource: { name: 'twin', npmCacheDirectory: '/a', npmDependencies: { a: '1' } } },
    second: { kind: 'local', packageSource: { name: 'second', npmCacheDirectory: '/b', npmDependencies: { b: '1' } } },
  }};
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let releaseBarrier;
  const barrier = new Promise(resolve => releaseBarrier = resolve);
  let outer;
  outer = await buildmessage.capture({ title: 'outer' }, async () => {
  await prefetchNpmDependencies(packageMap, async (name, dir) => {
    calls.push(dir); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    if (inFlight === 2) releaseBarrier();
    await barrier; inFlight--;
    if (dir === '/b') buildmessage.error('expected');
    return false;
  }, { maxConcurrency: 2, cpuCount: 2 });
  buildmessage.error('outside');
  });
  await selftest.expectEqual(calls.sort(), ['/a', '/b']);
  await selftest.expectEqual(maxInFlight, 2);
  selftest.expectTrue(outer.hasMessages());
  selftest.expectTrue(outer.formatMessages().includes('outside'));
  selftest.expectFalse(outer.formatMessages().includes('expected'));
});

selftest.define("npm - prefetch runs speculative work on Windows", async () => {
  const packageMap = { _map: {
    first: {
      kind: 'local',
      packageSource: {
        name: 'first',
        npmCacheDirectory: '/a',
        npmDependencies: { a: '1' },
      },
    },
  }};
  const calls = [];

  await prefetchNpmDependencies(packageMap, async (...args) => {
    calls.push(args);
  }, { platform: 'win32', maxConcurrency: 1, cpuCount: 1 });

  await selftest.expectEqual(calls, [["first", "/a", { a: "1" }, true]]);
});

selftest.define("npm - subset package builds skip prefetch", async () => {
  const cache = new IsopackCache({ packageMap: {}, tropohouse: null });
  let prefetched = 0;
  const loaded = [];
  cache._prefetchNpmDependencies = async () => { prefetched++; };
  cache._ensurePackageLoaded = async name => { loaded.push(name); };
  await buildmessage.capture({ title: 'subset' }, async () => {
    await cache.buildLocalPackages(['one']);
  });
  await selftest.expectEqual(prefetched, 0);
  await selftest.expectEqual(loaded, ['one']);
});

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
    // get-ready prefetch may install this package before the Run starts, so
    // installation logging is not a stable assertion here. The executable's
    // output below remains the behavior this regression test protects.
    run.waitSecs(15);
    await run.match("null; From shell script\n");
    await run.expectExit(0);
  }
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
