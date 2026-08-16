const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const test = require('node:test');

const { finalizeCoverage } = require('../src/coverage/finalize.js');
const { writeCoverageArtifact } = require('../src/coverage/artifact.js');
const { createCoverageMap } = require('istanbul-lib-coverage');

function fileCoverage(filename, counters) {
  const statementMap = {};
  const s = {};
  counters.forEach((counter, index) => {
    statementMap[index] = {
      start: { line: index + 1, column: 0 },
      end: { line: index + 1, column: 8 },
    };
    s[index] = counter;
  });
  return {
    path: filename,
    statementMap,
    fnMap: {},
    branchMap: {},
    s,
    f: {},
    b: {},
  };
}

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-finalize-'));
  const appRoot = path.join(root, 'app');
  const generation = 'generation-finalize';
  const artifactRoot = path.join(root, generation);
  fs.mkdirSync(path.join(appRoot, 'src'), { recursive: true });
  const files = {
    included: path.join(appRoot, 'src', 'included.js'),
    excluded: path.join(appRoot, 'src', 'excluded.js'),
    low: path.join(appRoot, 'src', 'low.js'),
    external: path.join(root, 'external.js'),
  };
  for (const filename of Object.values(files)) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, 'export const value = 1;\n');
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, appRoot, generation, artifactRoot, files };
}

function writeArtifact(fixture, producer, coverage) {
  const outputPath = path.join(fixture.artifactRoot, `${producer}.json`);
  writeCoverageArtifact({
    outputPath,
    expectedPath: outputPath,
    artifact: {
      schemaVersion: 1,
      generation: fixture.generation,
      producer,
      coverage,
    },
  });
  return { producer, path: outputPath };
}

function providerFake() {
  const calls = { create: 0, reports: [] };
  return {
    calls,
    provider: {
      createCoverageMap() {
        calls.create += 1;
        return createCoverageMap();
      },
      async generateReports(map) {
        calls.reports.push(map.toJSON());
      },
    },
  };
}

test('finalizer merges two real Istanbul maps then filters and reports once', async t => {
  const fixture = createFixture(t);
  const reportsDirectory = path.join(fixture.appRoot, 'coverage');
  fs.mkdirSync(reportsDirectory);
  fs.writeFileSync(path.join(reportsDirectory, 'stale.txt'), 'stale');
  const artifacts = [
    writeArtifact(fixture, 'native', {
      [fixture.files.included]: fileCoverage(fixture.files.included, [1, 0]),
      [fixture.files.excluded]: fileCoverage(fixture.files.excluded, [1]),
      [fixture.files.external]: fileCoverage(fixture.files.external, [1]),
    }),
    writeArtifact(fixture, 'server', {
      [fixture.files.included]: fileCoverage(fixture.files.included, [2, 1]),
    }),
  ];
  const fake = providerFake();

  const result = await finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: {
      coverage: {
        enabled: true,
        provider: 'istanbul',
        include: ['src/**/*.js'],
        exclude: ['**/excluded.js'],
        allowExternal: false,
        clean: true,
        reporters: ['json'],
        reportsDirectory,
        thresholds: { lines: 100 },
        reportOnFailure: true,
      },
    },
    async loadCoverageProvider() { return fake.provider; },
  });

  const included = fs.realpathSync(fixture.files.included);
  assert.deepEqual(result, { exitCode: 0, files: [included] });
  assert.equal(fake.calls.create, 1);
  assert.equal(fake.calls.reports.length, 1);
  assert.deepEqual(fake.calls.reports[0][included].s, { 0: 3, 1: 1 });
  assert.equal(fs.existsSync(path.join(reportsDirectory, 'stale.txt')), false);
});

test('finalizer admits physical external sources only when allowExternal is enabled', async t => {
  const fixture = createFixture(t);
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.external]: fileCoverage(fixture.files.external, [1]),
  })];
  const fake = providerFake();

  const result = await finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: {
      coverage: {
        enabled: true,
        provider: 'istanbul',
        allowExternal: true,
        clean: false,
        reporters: ['text'],
        reportsDirectory: path.join(fixture.appRoot, 'coverage'),
      },
    },
    async loadCoverageProvider() { return fake.provider; },
  });

  assert.deepEqual(result.files, [fs.realpathSync(fixture.files.external)]);
  assert.equal(fake.calls.reports.length, 1);
});

test('reportOnFailure controls the one clean/report pass without replacing test failure', async t => {
  for (const reportOnFailure of [false, true]) {
    const fixture = createFixture(t);
    const reportsDirectory = path.join(fixture.appRoot, 'coverage');
    fs.mkdirSync(reportsDirectory);
    const stale = path.join(reportsDirectory, 'stale.txt');
    fs.writeFileSync(stale, 'stale');
    const artifacts = [writeArtifact(fixture, 'native', {
      [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
    })];
    const fake = providerFake();

    const result = await finalizeCoverage({
      manifest: {
        schemaVersion: 1,
        generation: fixture.generation,
        appRoot: fixture.appRoot,
        localPackages: [],
        artifacts,
        testExitCode: 2,
      },
      config: {
        coverage: {
          enabled: true,
          provider: 'istanbul',
          clean: true,
          reporters: ['text'],
          reportsDirectory,
          reportOnFailure,
        },
      },
      async loadCoverageProvider() { return fake.provider; },
    });

    assert.equal(result.exitCode, 0);
    assert.equal(fake.calls.reports.length, reportOnFailure ? 1 : 0);
    assert.equal(fs.existsSync(stale), !reportOnFailure);
  }
});

test('finalizer enforces positive, negative, glob, and per-file thresholds', async t => {
  const cases = [
    [{ lines: 60 }, 1],
    [{ statements: -1 }, 1],
    [{ 'src/low.js': { lines: 1 } }, 1],
    [{ 'src/*.js': { lines: 40, perFile: true } }, 1],
    [{ lines: 30, perFile: true }, 1],
    [{ statements: -2, perFile: true }, 1],
    [{ statements: -3, perFile: true }, 0],
    [{ lines: 30, statements: -3 }, 0],
  ];

  for (const [thresholds, expectedExitCode] of cases) {
    const fixture = createFixture(t);
    const artifacts = [writeArtifact(fixture, 'server', {
      [fixture.files.included]: fileCoverage(fixture.files.included, [1, 1]),
      [fixture.files.low]: fileCoverage(fixture.files.low, [0, 0, 0]),
    })];
    const fake = providerFake();
    const failures = [];

    const result = await finalizeCoverage({
      manifest: {
        schemaVersion: 1,
        generation: fixture.generation,
        appRoot: fixture.appRoot,
        localPackages: [],
        artifacts,
        testExitCode: 0,
      },
      config: {
        coverage: {
          enabled: true,
          provider: 'istanbul',
          clean: false,
          reporters: ['text'],
          reportsDirectory: path.join(fixture.appRoot, 'coverage'),
          thresholds,
          reportOnFailure: false,
        },
      },
      async loadCoverageProvider() { return fake.provider; },
      onThresholdFailure(message) { failures.push(message); },
    });

    assert.equal(result.exitCode, expectedExitCode, JSON.stringify(thresholds));
    assert.equal(fake.calls.create, 1);
    assert.equal(fake.calls.reports.length, 1);
    assert.equal(failures.length, expectedExitCode);
  }
});

test('coverage finalizer CLI consumes only its explicit manifest', t => {
  const fixture = createFixture(t);
  const artifact = writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  });
  const manifestPath = path.join(fixture.artifactRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    generation: fixture.generation,
    appRoot: fixture.appRoot,
    localPackages: [],
    artifacts: [artifact],
    testExitCode: 0,
  }), { mode: 0o600 });
  fs.writeFileSync(path.join(fixture.appRoot, 'rstest.config.js'), `
    module.exports = {
      coverage: {
        enabled: true,
        provider: 'istanbul',
        reporters: [],
        clean: false,
        thresholds: { lines: 100 },
      },
    };
  `);
  fs.symlinkSync(
    path.resolve(__dirname, '../node_modules'),
    path.join(fixture.appRoot, 'node_modules'),
  );
  const bin = path.resolve(__dirname, '../bin/meteor-rstest.js');

  const result = childProcess.spawnSync(process.execPath, [
    bin,
    '--cwd', fixture.appRoot,
    '--once',
    '--coverage-finalize-manifest', manifestPath,
  ], {
    cwd: fixture.appRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stdout, /Test Files|Tests /);
});

test('finalizer rejects replay of a consumed generation', async t => {
  const fixture = createFixture(t);
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];
  const manifest = {
    schemaVersion: 1,
    generation: fixture.generation,
    appRoot: fixture.appRoot,
    localPackages: [],
    artifacts,
    testExitCode: 0,
  };
  const config = {
    coverage: {
      enabled: true,
      provider: 'istanbul',
      reporters: [],
      clean: false,
    },
  };
  const first = providerFake();
  await finalizeCoverage({
    manifest,
    config,
    async loadCoverageProvider() { return first.provider; },
  });

  await assert.rejects(finalizeCoverage({
    manifest,
    config,
    async loadCoverageProvider() { return providerFake().provider; },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPLAY');
    return true;
  });
});

test('finalizer never cleans its generation artifact directory', async t => {
  const fixture = createFixture(t);
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];

  await assert.rejects(finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: {
      coverage: {
        enabled: true,
        provider: 'istanbul',
        reporters: [],
        clean: true,
        reportsDirectory: fixture.artifactRoot,
      },
    },
    async loadCoverageProvider() { return providerFake().provider; },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE');
    return true;
  });
  assert.equal(fs.existsSync(artifacts[0].path), true);
});

test('finalizer rejects a reports directory reached through a symlink parent', async t => {
  const fixture = createFixture(t);
  const outside = path.join(fixture.root, 'outside');
  const reportsDirectory = path.join(fixture.appRoot, 'linked', 'coverage');
  fs.mkdirSync(path.join(outside, 'coverage'), { recursive: true });
  const sentinel = path.join(outside, 'coverage', 'sentinel.txt');
  fs.writeFileSync(sentinel, 'keep');
  fs.symlinkSync(outside, path.join(fixture.appRoot, 'linked'));
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];

  await assert.rejects(finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: { coverage: { clean: true, reportsDirectory } },
    async loadCoverageProvider() { return providerFake().provider; },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE');
    return true;
  });
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
});

test('finalizer resists parent substitution between cleanup validation and deletion', async t => {
  const fixture = createFixture(t);
  const reportsParent = path.join(fixture.appRoot, 'build');
  const originalParent = path.join(fixture.appRoot, 'build-original');
  const reportsDirectory = path.join(reportsParent, 'coverage');
  const outside = path.join(fixture.root, 'outside');
  const outsideReports = path.join(outside, 'coverage');
  fs.mkdirSync(reportsDirectory, { recursive: true });
  fs.mkdirSync(outsideReports, { recursive: true });
  fs.writeFileSync(path.join(reportsDirectory, 'stale.txt'), 'stale');
  const sentinel = path.join(outsideReports, 'sentinel.txt');
  fs.writeFileSync(sentinel, 'keep');
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];
  const originalRm = fs.rmSync;
  const originalSpawn = childProcess.spawnSync;
  let substituted = false;
  const substituteParent = () => {
    if (substituted) return;
    substituted = true;
    fs.renameSync(reportsParent, originalParent);
    fs.symlinkSync(outside, reportsParent);
  };
  fs.rmSync = function patchedRm(filename, ...args) {
    if (path.resolve(filename) === path.resolve(reportsDirectory)) {
      substituteParent();
    }
    return originalRm.call(this, filename, ...args);
  };
  childProcess.spawnSync = function patchedSpawn(...args) {
    if (args[2] && args[2].cwd &&
        fs.realpathSync(args[2].cwd) === fs.realpathSync(reportsDirectory)) {
      substituteParent();
    }
    return originalSpawn.apply(this, args);
  };
  t.after(() => {
    fs.rmSync = originalRm;
    childProcess.spawnSync = originalSpawn;
  });

  await assert.rejects(finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: { coverage: { clean: true, reportsDirectory } },
    async loadCoverageProvider() { return providerFake().provider; },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE');
    return true;
  });
  assert.equal(substituted, true);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
});

test('finalizer rejects coordinated substitution while pinning the cleanup directory', async t => {
  const fixture = createFixture(t);
  const reportsParent = path.join(fixture.appRoot, 'build');
  const originalParent = path.join(fixture.appRoot, 'build-original');
  const reportsDirectory = path.join(reportsParent, 'coverage');
  const outside = path.join(fixture.root, 'outside');
  const outsideReports = path.join(outside, 'coverage');
  fs.mkdirSync(reportsDirectory, { recursive: true });
  fs.mkdirSync(outsideReports, { recursive: true });
  const sentinel = path.join(outsideReports, 'sentinel.txt');
  fs.writeFileSync(sentinel, 'keep');
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];
  const originalOpen = fs.openSync;
  const originalSpawn = childProcess.spawnSync;
  let pinnedOutside = false;
  const redirect = () => {
    fs.renameSync(reportsParent, originalParent);
    fs.symlinkSync(outside, reportsParent);
  };
  const restore = () => {
    fs.unlinkSync(reportsParent);
    fs.renameSync(originalParent, reportsParent);
  };
  fs.openSync = function patchedOpen(filename, ...args) {
    if (!pinnedOutside && typeof filename === 'string' &&
        path.basename(filename) === 'coverage' &&
        path.basename(path.dirname(filename)) === 'build') {
      redirect();
      const descriptor = originalOpen.call(this, filename, ...args);
      restore();
      pinnedOutside = true;
      return descriptor;
    }
    return originalOpen.call(this, filename, ...args);
  };
  childProcess.spawnSync = function patchedSpawn(...args) {
    if (pinnedOutside && args[2] && args[2].cwd) redirect();
    return originalSpawn.apply(this, args);
  };
  t.after(() => {
    fs.openSync = originalOpen;
    childProcess.spawnSync = originalSpawn;
  });

  await assert.rejects(finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: { coverage: { clean: true, reportsDirectory } },
    async loadCoverageProvider() { return providerFake().provider; },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE');
    return true;
  });
  assert.equal(pinnedOutside, true);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
});

test('custom empty excludes retain mandatory dependency and test-file exclusions', async t => {
  const fixture = createFixture(t);
  Object.assign(fixture.files, {
    dependency: path.join(
      fixture.appRoot,
      'node_modules',
      'dependency',
      'index.js',
    ),
    testHelper: path.join(fixture.appRoot, 'src', '__tests__', 'helper.js'),
    mockHelper: path.join(fixture.appRoot, 'src', '__mocks__', 'helper.js'),
    declaration: path.join(fixture.appRoot, 'src', 'types.d.ts'),
  });
  for (const filename of [
    fixture.files.dependency,
    fixture.files.testHelper,
    fixture.files.mockHelper,
    fixture.files.declaration,
  ]) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, 'export const value = 1;\n');
  }
  const coverage = Object.fromEntries([
    fixture.files.included,
    fixture.files.dependency,
    fixture.files.testHelper,
    fixture.files.mockHelper,
    fixture.files.declaration,
  ].map(filename => [filename, fileCoverage(filename, [1])]));
  const artifacts = [writeArtifact(fixture, 'server', coverage)];

  const result = await finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: { coverage: { exclude: [], clean: false, reporters: [] } },
    async loadCoverageProvider() { return providerFake().provider; },
  });

  assert.deepEqual(result.files, [fs.realpathSync(fixture.files.included)]);
});

test('safe cleanup unlinks report symlinks without traversing their targets', async t => {
  const fixture = createFixture(t);
  const reportsDirectory = path.join(fixture.appRoot, 'coverage');
  const outside = path.join(fixture.root, 'outside');
  fs.mkdirSync(reportsDirectory);
  fs.mkdirSync(outside);
  const sentinel = path.join(outside, 'sentinel.txt');
  fs.writeFileSync(sentinel, 'keep');
  fs.symlinkSync(outside, path.join(reportsDirectory, 'linked-output'));
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];

  await finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: { coverage: { clean: true, reportsDirectory } },
    async loadCoverageProvider() { return providerFake().provider; },
  });

  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(reportsDirectory, 'linked-output')), false);
});

test('safe cleanup accepts a new report directory under the canonical app root', async t => {
  const fixture = createFixture(t);
  const reportsDirectory = path.join(fixture.appRoot, 'new-coverage');
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];

  const result = await finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: { coverage: { clean: true, reportsDirectory } },
    async loadCoverageProvider() { return providerFake().provider; },
  });

  assert.equal(result.exitCode, 0);
});

test('safe cleanup supports identity fallback when no-follow flags are unavailable', async t => {
  const fixture = createFixture(t);
  const reportsDirectory = path.join(fixture.appRoot, 'coverage');
  fs.mkdirSync(reportsDirectory);
  const stale = path.join(reportsDirectory, 'stale.txt');
  fs.writeFileSync(stale, 'stale');
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];
  const originalOpen = fs.openSync;
  fs.openSync = function rejectNoFollow(filename, flags, ...args) {
    if (typeof flags === 'number' && fs.constants.O_NOFOLLOW &&
        (flags & fs.constants.O_NOFOLLOW) !== 0) {
      const error = new Error('simulated unsupported directory flags');
      error.code = 'EINVAL';
      throw error;
    }
    return originalOpen.call(this, filename, flags, ...args);
  };
  t.after(() => { fs.openSync = originalOpen; });

  const result = await finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: { coverage: { clean: true, reportsDirectory } },
    fileSystemCapabilities: { noFollow: false, directory: false },
    async loadCoverageProvider() { return providerFake().provider; },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(fs.existsSync(stale), false);
});

test('no-flag cleanup fallback still rejects a reparse-style parent link', async t => {
  const fixture = createFixture(t);
  const outside = path.join(fixture.root, 'outside');
  const reportsDirectory = path.join(fixture.appRoot, 'linked', 'coverage');
  fs.mkdirSync(path.join(outside, 'coverage'), { recursive: true });
  const sentinel = path.join(outside, 'coverage', 'sentinel.txt');
  fs.writeFileSync(sentinel, 'keep');
  fs.symlinkSync(outside, path.join(fixture.appRoot, 'linked'));
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];

  await assert.rejects(finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: { coverage: { clean: true, reportsDirectory } },
    fileSystemCapabilities: { noFollow: false, directory: false },
    async loadCoverageProvider() { return providerFake().provider; },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE');
    return true;
  });
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
});

test('safe cleanup permits an explicit non-overlapping external report directory', async t => {
  const fixture = createFixture(t);
  const reportsDirectory = path.join(fixture.root, 'external-reports');
  fs.mkdirSync(reportsDirectory);
  const stale = path.join(reportsDirectory, 'stale.txt');
  fs.writeFileSync(stale, 'stale');
  const artifacts = [writeArtifact(fixture, 'server', {
    [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
  })];

  const result = await finalizeCoverage({
    manifest: {
      schemaVersion: 1,
      generation: fixture.generation,
      appRoot: fixture.appRoot,
      localPackages: [],
      artifacts,
      testExitCode: 0,
    },
    config: { coverage: { clean: true, reportsDirectory } },
    async loadCoverageProvider() { return providerFake().provider; },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(fs.existsSync(stale), false);
});

test('explicit external cleanup still rejects app and artifact overlap', async t => {
  for (const overlap of ['app', 'artifact']) {
    const fixture = createFixture(t);
    const reportsDirectory = overlap === 'app'
      ? fixture.root
      : fixture.artifactRoot;
    const artifacts = [writeArtifact(fixture, 'server', {
      [fixture.files.included]: fileCoverage(fixture.files.included, [1]),
    })];

    await assert.rejects(finalizeCoverage({
      manifest: {
        schemaVersion: 1,
        generation: fixture.generation,
        appRoot: fixture.appRoot,
        localPackages: [],
        artifacts,
        testExitCode: 0,
      },
      config: { coverage: { clean: true, reportsDirectory } },
      async loadCoverageProvider() { return providerFake().provider; },
    }), error => {
      assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE');
      return true;
    });
    assert.equal(fs.existsSync(artifacts[0].path), true);
    assert.equal(fs.existsSync(fixture.files.included), true);
  }
});
