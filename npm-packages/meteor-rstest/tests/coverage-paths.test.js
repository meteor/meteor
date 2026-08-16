const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  canonicalizeCoverageMaps,
  canonicalizeCoveragePath,
} = require('../src/coverage/paths.js');

function fileCoverage(filename, endColumn = 8) {
  return {
    path: filename,
    statementMap: {
      0: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: endColumn },
      },
    },
    fnMap: {},
    branchMap: {},
    s: { 0: 1 },
    f: {},
    b: {},
  };
}

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-paths-'));
  const appRoot = path.join(root, 'app');
  const packageRoot = path.join(root, 'packages', 'exact-name');
  const testPackageRoot = path.join(root, 'packages', 'exact-name-tests');
  const externalRoot = path.join(root, 'external');
  for (const directory of [appRoot, packageRoot, testPackageRoot, externalRoot]) {
    fs.mkdirSync(path.join(directory, 'src'), { recursive: true });
  }
  const appFile = path.join(appRoot, 'src', 'app.js');
  const packageFile = path.join(packageRoot, 'src', 'package.js');
  const testPackageFile = path.join(testPackageRoot, 'src', 'package.test-helper.js');
  const externalFile = path.join(externalRoot, 'src', 'external.js');
  for (const file of [appFile, packageFile, testPackageFile, externalFile]) {
    fs.writeFileSync(file, 'export const value = 1;\n');
  }
  const symlink = path.join(appRoot, 'src', 'app-link.js');
  fs.symlinkSync(appFile, symlink);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    appRoot,
    appFile: fs.realpathSync(appFile),
    packageRoot,
    packageFile: fs.realpathSync(packageFile),
    testPackageRoot,
    testPackageFile: fs.realpathSync(testPackageFile),
    externalFile: fs.realpathSync(externalFile),
    symlink,
    localPackages: [
      { name: 'exact-name', sourceRoot: packageRoot },
      { name: 'local-test:exact-name', sourceRoot: testPackageRoot },
    ],
  };
}

test('canonical paths use app realpaths and exact local package roots', t => {
  const fixture = createFixture(t);
  const options = {
    appRoot: fixture.appRoot,
    localPackages: fixture.localPackages,
  };

  assert.equal(canonicalizeCoveragePath(fixture.symlink, options), fixture.appFile);
  assert.equal(
    canonicalizeCoveragePath('src/app.js', options),
    fixture.appFile,
  );
  assert.equal(
    canonicalizeCoveragePath('packages/exact-name/src/package.js', options),
    fixture.packageFile,
  );
  assert.equal(
    canonicalizeCoveragePath(
      'local-test:exact-name/src/package.test-helper.js',
      options,
    ),
    fixture.testPackageFile,
  );
  assert.throws(() => canonicalizeCoveragePath(
    'packages/exact-name-extra/src/package.js',
    options,
  ), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_PACKAGE_UNKNOWN');
    return true;
  });
});

test('canonical maps filter exclusions, generated files, tests, and denied external paths', t => {
  const fixture = createFixture(t);
  const excluded = path.join(fixture.appRoot, 'src', 'excluded.js');
  const generated = path.join(
    fixture.appRoot,
    '.meteor',
    'local',
    'rstest',
    'generated.js',
  );
  const testFile = path.join(fixture.appRoot, 'src', 'feature.test.js');
  for (const file of [excluded, generated, testFile]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export const ignored = true;\n');
  }
  const coverage = Object.fromEntries([
    fixture.appFile,
    excluded,
    generated,
    testFile,
    fixture.externalFile,
  ].map(file => [file, fileCoverage(file)]));

  const denied = canonicalizeCoverageMaps([coverage], {
    appRoot: fixture.appRoot,
    localPackages: fixture.localPackages,
    include: ['src/**/*.js'],
    exclude: ['**/excluded.js'],
    allowExternal: false,
  });
  assert.deepEqual(denied.files, [fixture.appFile]);

  const allowed = canonicalizeCoverageMaps([{
    [fixture.externalFile]: fileCoverage(fixture.externalFile),
  }], {
    appRoot: fixture.appRoot,
    localPackages: fixture.localPackages,
    allowExternal: true,
  });
  assert.deepEqual(allowed.files, [fixture.externalFile]);
});

test('canonical maps reject internal path disagreement while preserving compiler variants', t => {
  const fixture = createFixture(t);
  assert.throws(() => canonicalizeCoverageMaps([{
    [fixture.appFile]: fileCoverage(fixture.packageFile),
  }], {
    appRoot: fixture.appRoot,
    localPackages: fixture.localPackages,
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_PATH_MISMATCH');
    return true;
  });

  const canonical = canonicalizeCoverageMaps([{
    [fixture.appFile]: fileCoverage(fixture.appFile, 8),
  }, {
    [fixture.symlink]: fileCoverage(fixture.symlink, 12),
  }], {
    appRoot: fixture.appRoot,
    localPackages: fixture.localPackages,
  });
  assert.equal(canonical.maps.length, 2);
  assert.deepEqual(canonical.files, [fixture.appFile]);
});
