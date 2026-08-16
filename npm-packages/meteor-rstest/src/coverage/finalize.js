const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const picomatch = require('picomatch');

const {
  assertNoSymlinkComponents,
  readCoverageArtifact,
} = require('./artifact.js');
const { canonicalizeCoverageMaps } = require('./paths.js');

const THRESHOLD_KEYS = ['lines', 'functions', 'statements', 'branches'];
const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/*.d.ts',
  '**/*.{test,spec}.[jt]s',
  '**/*.{test,spec}.[cm][jt]s',
  '**/*.{test,spec}.[jt]sx',
  '**/*.{test,spec}.[cm][jt]sx',
];

function finalizerError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

function slash(filename) {
  return filename.split(path.sep).join('/');
}

function normalizeCoverageConfig(config, appRoot) {
  const input = config && config.coverage === true
    ? {}
    : config && config.coverage && typeof config.coverage === 'object'
      ? config.coverage
      : {};
  if (input.provider !== undefined && input.provider !== 'istanbul') {
    throw finalizerError(
      'METEOR_RSTEST_COVERAGE_PROVIDER_UNSUPPORTED',
      'Meteor-hosted coverage finalization requires the Istanbul provider.',
    );
  }
  for (const field of ['include', 'exclude']) {
    if (input[field] !== undefined && (
      !Array.isArray(input[field]) ||
      input[field].some(pattern => typeof pattern !== 'string')
    )) {
      throw finalizerError(
        'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
        `coverage.${field} must contain only string patterns.`,
      );
    }
  }
  const reportsDirectory = path.resolve(
    appRoot,
    input.reportsDirectory === undefined ? 'coverage' : input.reportsDirectory,
  );
  return {
    enabled: true,
    include: input.include,
    changed: input.changed,
    exclude: [...DEFAULT_EXCLUDE, ...(input.exclude || [])],
    provider: 'istanbul',
    reporters: input.reporters === undefined
      ? ['text', 'html', 'clover', 'json']
      : [...input.reporters],
    reportsDirectory,
    clean: input.clean ?? true,
    thresholds: input.thresholds,
    reportOnFailure: input.reportOnFailure ?? false,
    allowExternal: input.allowExternal ?? false,
  };
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      manifest.schemaVersion !== 1 ||
      typeof manifest.generation !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(manifest.generation) ||
      typeof manifest.appRoot !== 'string' || !path.isAbsolute(manifest.appRoot) ||
      !Array.isArray(manifest.localPackages) ||
      !Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0 ||
      !Number.isInteger(manifest.testExitCode) || manifest.testExitCode < 0) {
    throw finalizerError(
      'METEOR_RSTEST_COVERAGE_MANIFEST_INVALID',
      'Coverage finalizer manifest is invalid.',
    );
  }
  const paths = new Set();
  const producers = new Set();
  let artifactRoot;
  for (const artifact of manifest.artifacts) {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) ||
        typeof artifact.producer !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(artifact.producer) ||
        typeof artifact.path !== 'string' || !path.isAbsolute(artifact.path)) {
      throw finalizerError(
        'METEOR_RSTEST_COVERAGE_MANIFEST_INVALID',
        'Coverage finalizer manifest contains an invalid artifact descriptor.',
      );
    }
    const artifactPath = path.resolve(artifact.path);
    const parent = path.dirname(artifactPath);
    if (path.basename(parent) !== manifest.generation ||
        path.basename(artifactPath) !== `${artifact.producer}.json`) {
      throw finalizerError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage artifact is not bound to generation ${manifest.generation}.`,
      );
    }
    if (artifactRoot !== undefined && artifactRoot !== parent) {
      throw finalizerError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        'Coverage artifacts do not share one explicit generation directory.',
      );
    }
    artifactRoot = parent;
    if (paths.has(artifactPath) || producers.has(artifact.producer)) {
      throw finalizerError(
        'METEOR_RSTEST_COVERAGE_REPLAY',
        'Coverage finalizer manifest repeats an artifact or producer.',
      );
    }
    paths.add(artifactPath);
    producers.add(artifact.producer);
  }
  return manifest;
}

function claimCoverageGeneration(manifest) {
  const artifactRoot = path.dirname(path.resolve(manifest.artifacts[0].path));
  const marker = path.join(artifactRoot, '.finalized');
  let descriptor;
  try {
    descriptor = fs.openSync(marker, 'wx', 0o600);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.chmodSync(marker, 0o600);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (error.code === 'EEXIST') {
      throw finalizerError(
        'METEOR_RSTEST_COVERAGE_REPLAY',
        `Coverage generation ${manifest.generation} was already finalized.`,
      );
    }
    throw error;
  }
}

async function loadAppCoverageProvider({ options, root }) {
  const appRequire = createRequire(path.join(root, 'package.json'));
  let providerPath;
  try {
    providerPath = appRequire.resolve('@rstest/coverage-istanbul');
  } catch {
    throw finalizerError(
      'METEOR_RSTEST_COVERAGE_PROVIDER_MISSING',
      'Install @rstest/coverage-istanbul@0.11.6 in the Meteor application.',
    );
  }
  const module = await import(pathToFileURL(providerPath).href);
  if (typeof module.CoverageProvider !== 'function') {
    throw finalizerError(
      'METEOR_RSTEST_COVERAGE_PROVIDER_INVALID',
      '@rstest/coverage-istanbul does not export its public CoverageProvider.',
    );
  }
  const provider = new module.CoverageProvider(options, root);
  await provider.init?.();
  return provider;
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function canonicalizePotentialPath(filename) {
  let existing = path.resolve(filename);
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...missing);
}

function assertSafeReportsDirectory(reportsDirectory, appRoot, artifactRoot) {
  const canonicalAppRoot = fs.realpathSync(appRoot);
  assertNoSymlinkComponents(canonicalAppRoot);
  assertNoSymlinkComponents(artifactRoot);
  const canonicalArtifactRoot = fs.realpathSync(artifactRoot);
  try {
    assertNoSymlinkComponents(reportsDirectory, { allowMissing: true });
  } catch (error) {
    if (error.code === 'METEOR_RSTEST_COVERAGE_PATH_MISMATCH') {
      throw finalizerError(
        'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE',
        `Refusing to clean symlinked coverage reports directory: ${reportsDirectory}`,
      );
    }
    throw error;
  }
  const configuredTarget = path.join(
    canonicalizePotentialPath(path.dirname(reportsDirectory)),
    path.basename(reportsDirectory),
  );
  const resolved = fs.existsSync(reportsDirectory)
    ? fs.realpathSync(reportsDirectory)
    : configuredTarget;
  const root = path.parse(resolved).root;
  if (resolved !== configuredTarget || resolved === root ||
      resolved === canonicalAppRoot ||
      !contains(canonicalAppRoot, resolved) ||
      contains(resolved, canonicalArtifactRoot) ||
      contains(canonicalArtifactRoot, resolved)) {
    throw finalizerError(
      'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE',
      `Refusing to clean unsafe coverage reports directory: ${resolved}`,
    );
  }
  return resolved;
}

const CLEAN_DIRECTORY_SCRIPT = `
  const fs = require('node:fs');
  const expectedDevice = BigInt(process.argv[1]);
  const expectedInode = BigInt(process.argv[2]);
  const flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY |
    fs.constants.O_NOFOLLOW;
  const descriptor = fs.openSync('.', flags);
  try {
    const stat = fs.fstatSync(descriptor, { bigint: true });
    if (!stat.isDirectory() || stat.dev !== expectedDevice ||
        stat.ino !== expectedInode) process.exit(73);
    for (const entry of fs.readdirSync('.')) {
      fs.rmSync(entry, { recursive: true, force: false });
    }
  } finally {
    fs.closeSync(descriptor);
  }
`;

function cleanReportsDirectory(reportsDirectory, appRoot, artifactRoot) {
  const safeDirectory = assertSafeReportsDirectory(
    reportsDirectory,
    appRoot,
    artifactRoot,
  );
  if (!fs.existsSync(safeDirectory)) return;
  if (!Number.isInteger(fs.constants.O_NOFOLLOW) ||
      fs.constants.O_NOFOLLOW === 0 ||
      !Number.isInteger(fs.constants.O_DIRECTORY)) {
    throw finalizerError(
      'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE',
      'This platform cannot pin a no-follow coverage reports directory.',
    );
  }
  const flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY |
    fs.constants.O_NOFOLLOW;
  let descriptor;
  try {
    descriptor = fs.openSync(safeDirectory, flags);
  } catch (error) {
    throw finalizerError(
      'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE',
      `Could not pin coverage reports directory: ${error.message}`,
    );
  }
  try {
    const stat = fs.fstatSync(descriptor, { bigint: true });
    if (!stat.isDirectory()) {
      throw finalizerError(
        'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE',
        `Coverage reports path is not a directory: ${safeDirectory}`,
      );
    }
    assertNoSymlinkComponents(safeDirectory);
    let verificationDescriptor;
    try {
      verificationDescriptor = fs.openSync(safeDirectory, flags);
      const verification = fs.fstatSync(verificationDescriptor, { bigint: true });
      if (!verification.isDirectory() || verification.dev !== stat.dev ||
          verification.ino !== stat.ino) {
        throw finalizerError(
          'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE',
          'Coverage reports directory changed while it was being pinned.',
        );
      }
    } finally {
      if (verificationDescriptor !== undefined) {
        fs.closeSync(verificationDescriptor);
      }
    }
    const result = childProcess.spawnSync(process.execPath, [
      '-e',
      CLEAN_DIRECTORY_SCRIPT,
      stat.dev.toString(),
      stat.ino.toString(),
    ], {
      cwd: safeDirectory,
      encoding: 'utf8',
    });
    if (result.error || result.status !== 0) {
      throw finalizerError(
        'METEOR_RSTEST_COVERAGE_REPORT_DIRECTORY_UNSAFE',
        'Coverage reports directory changed during safe cleanup.',
      );
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function percent(covered, total) {
  if (total === 0) return 100;
  return Math.floor((1000 * 100 * covered / total) / 10) / 100;
}

function aggregateSummaries(summaries) {
  return Object.fromEntries(THRESHOLD_KEYS.map(key => {
    const total = summaries.reduce((sum, summary) => sum + summary[key].total, 0);
    const covered = summaries.reduce(
      (sum, summary) => sum + summary[key].covered,
      0,
    );
    return [key, { total, covered, pct: percent(covered, total) }];
  }));
}

function checkThresholdValue({ metric, group, actual, expected, file }) {
  if (typeof expected !== 'number' || !Number.isFinite(expected)) {
    throw finalizerError(
      'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
      `Coverage threshold ${group}.${metric} must be a finite number.`,
    );
  }
  const failed = expected < 0
    ? actual.total - actual.covered > -expected
    : actual.pct < expected;
  if (!failed) return null;
  const location = file ? `${file}: ` : '';
  return expected < 0
    ? `${location}uncovered ${metric} ${actual.total - actual.covered} exceeds ${-expected} for ${group}`
    : `${location}${metric} coverage ${actual.pct}% does not meet ${expected}% for ${group}`;
}

function evaluateThresholds({ coverageMap, thresholds, appRoot }) {
  if (thresholds === undefined) return [];
  if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) {
    throw finalizerError(
      'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
      'coverage.thresholds must be an object.',
    );
  }
  const failures = [];
  const files = coverageMap.files();
  if (thresholds.perFile !== undefined &&
      typeof thresholds.perFile !== 'boolean') {
    throw finalizerError(
      'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
      'coverage.thresholds.perFile must be a boolean.',
    );
  }
  const globalSummaries = thresholds.perFile
    ? files.map(filename => ({
      file: slash(path.relative(appRoot, filename)),
      summary: coverageMap.fileCoverageFor(filename).toSummary(),
    }))
    : [{ file: '', summary: coverageMap.getCoverageSummary() }];
  for (const { file, summary } of globalSummaries) {
    for (const metric of THRESHOLD_KEYS) {
      if (thresholds[metric] === undefined) continue;
      const failure = checkThresholdValue({
        metric,
        group: 'global',
        actual: summary[metric],
        expected: thresholds[metric],
        file,
      });
      if (failure) failures.push(failure);
    }
  }

  for (const [glob, rule] of Object.entries(thresholds)) {
    if (THRESHOLD_KEYS.includes(glob) || glob === 'perFile') continue;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) ||
        rule.perFile !== undefined && typeof rule.perFile !== 'boolean') {
      throw finalizerError(
        'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
        `Coverage threshold rule ${glob} must be an object.`,
      );
    }
    const matches = picomatch(glob);
    const matchedFiles = files.filter(filename =>
      matches(slash(path.relative(appRoot, filename)))
    );
    if (matchedFiles.length === 0) {
      failures.push(`coverage data for ${glob} was not found`);
      continue;
    }
    const summaries = rule.perFile
      ? matchedFiles.map(filename => ({
        file: slash(path.relative(appRoot, filename)),
        summary: coverageMap.fileCoverageFor(filename).toSummary(),
      }))
      : [{
        file: '',
        summary: aggregateSummaries(matchedFiles.map(filename =>
          coverageMap.fileCoverageFor(filename).toSummary()
        )),
      }];
    for (const { file, summary } of summaries) {
      for (const metric of THRESHOLD_KEYS) {
        if (rule[metric] === undefined) continue;
        const failure = checkThresholdValue({
          metric,
          group: glob,
          actual: summary[metric],
          expected: rule[metric],
          file,
        });
        if (failure) failures.push(failure);
      }
    }
  }
  return failures;
}

async function finalizeCoverage({
  manifest: manifestInput,
  config,
  loadCoverageProvider = loadAppCoverageProvider,
  onThresholdFailure = message => console.error(`[Meteor Rstest] ${message}`),
}) {
  const manifest = validateManifest(manifestInput);
  claimCoverageGeneration(manifest);
  const coverageOptions = normalizeCoverageConfig(config, manifest.appRoot);
  const consumed = new Set();
  const artifacts = manifest.artifacts.map(artifact => readCoverageArtifact({
    filePath: artifact.path,
    expectedPath: artifact.path,
    generation: manifest.generation,
    producer: artifact.producer,
    consumed,
  }));
  const canonical = canonicalizeCoverageMaps(
    artifacts.map(artifact => artifact.coverage),
    {
      appRoot: manifest.appRoot,
      localPackages: manifest.localPackages,
      include: coverageOptions.include || [],
      exclude: coverageOptions.exclude,
      allowExternal: coverageOptions.allowExternal,
    },
  );
  const provider = await loadCoverageProvider({
    options: coverageOptions,
    root: manifest.appRoot,
  });
  if (!provider || typeof provider.createCoverageMap !== 'function' ||
      typeof provider.generateReports !== 'function') {
    throw finalizerError(
      'METEOR_RSTEST_COVERAGE_PROVIDER_INVALID',
      'Istanbul coverage provider is missing its public map/report APIs.',
    );
  }
  const coverageMap = provider.createCoverageMap();
  for (const map of canonical.maps) coverageMap.merge(map);

  const shouldReport = manifest.testExitCode === 0 ||
    coverageOptions.reportOnFailure;
  if (!shouldReport) {
    return { exitCode: 0, files: canonical.files };
  }
  if (coverageOptions.clean) {
    cleanReportsDirectory(
      coverageOptions.reportsDirectory,
      manifest.appRoot,
      path.dirname(path.resolve(manifest.artifacts[0].path)),
    );
  }
  await provider.generateReports(coverageMap);
  const failures = evaluateThresholds({
    coverageMap,
    thresholds: coverageOptions.thresholds,
    appRoot: manifest.appRoot,
  });
  if (failures.length > 0) onThresholdFailure(failures.join('\n'));
  return {
    exitCode: failures.length > 0 ? 1 : 0,
    files: canonical.files,
  };
}

module.exports = {
  evaluateThresholds,
  finalizeCoverage,
  loadAppCoverageProvider,
};
