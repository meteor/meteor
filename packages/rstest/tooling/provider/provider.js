const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { createRequire } = require('node:module');

const {
  ensureRstestInstalled,
} = require('../lib/dependencies.js');
const {
  assertRstestOptionalCapabilities,
  selectRstestOptionalCapabilities,
} = require('./capabilities.js');
const {
  inspectAppRstestCapability,
  scanRstestCandidates,
  scanNativeRstestRoots,
  selectRstestInventory,
  selectRstestLanes,
} = require('./inventory.js');
const {
  buildRstestArgs,
  startRstestProcess,
} = require('./process.js');
const { RstestBrowser } = require('./browser.js');
const { RstestExternal } = require('./external.js');
const { rstestError } = require('./errors.js');
const {
  aggregateRstestWorkerResults,
  createRstestHostDescriptors,
  validateRstestWorkerPayload,
} = require('./workers.js');

const CLIENT_PROJECTS = new Set([
  'meteor-pure-client',
  'meteor-browser',
  'meteor-runtime-client',
  'meteor-e2e',
]);
const SERVER_PROJECTS = new Set([
  'meteor-pure-server',
  'meteor-runtime-server',
  'meteor-e2e',
]);
const GENERATED_PROJECTS = new Set([
  ...CLIENT_PROJECTS,
  ...SERVER_PROJECTS,
]);
const PACKAGE_UNSUPPORTED_OPTIONS = [
  ['project', '--project'],
  ['testFile', '--test-file'],
  ['updateSnapshots', '--update-snapshots'],
  ['shard', '--shard'],
  ['changed', '--changed'],
  ['changedSince', '--changed-since'],
];
const RSTEST_TEST_FILE = /\.(?:test|spec)s?\.(?:[cm]?[jt]sx?)$/i;
const MAX_PRIVATE_JSON_BYTES = 64 * 1024 * 1024;
const RUNTIME_SETTING_DEFAULTS = Object.freeze({
  testTimeout: 30000,
  hookTimeout: 10000,
  maxConcurrency: 5,
  retry: 0,
  globals: false,
  clearMocks: false,
  resetMocks: false,
  restoreMocks: false,
  unstubEnvs: false,
  unstubGlobals: false,
  expect: {},
  snapshotFormat: {},
  env: {},
  silent: false,
  disableConsoleIntercept: true,
  printConsoleTrace: false,
  includeTaskLocation: false,
  setupFiles: [],
});

function removeIfPresent(filename) {
  try {
    fs.unlinkSync(filename);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function assertNoSymlinkParents(target, allowMissing) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const components = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      if (path.dirname(current) === parsed.root) {
        current = fs.realpathSync(current);
        continue;
      }
      throw rstestError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage manifest path contains a symbolic link: ${current}`,
      );
    }
    if (index < components.length - 1 && !stat.isDirectory()) {
      throw rstestError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage manifest parent is not a directory: ${current}`,
      );
    }
  }
}

function samePrivateIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function openPrivateDirectory(directory) {
  assertNoSymlinkParents(directory, false);
  if (!Number.isInteger(fs.constants.O_DIRECTORY)) {
    const stat = fs.lstatSync(directory, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw rstestError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage manifest parent identity changed: ${directory}`,
      );
    }
    assertNoSymlinkParents(directory, false);
    const verification = fs.lstatSync(directory, { bigint: true });
    if (!samePrivateIdentity(stat, verification)) {
      throw rstestError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage manifest parent identity changed: ${directory}`,
      );
    }
    return { descriptor: undefined, stat };
  }
  let flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY;
  if (Number.isInteger(fs.constants.O_NOFOLLOW) && fs.constants.O_NOFOLLOW) {
    flags |= fs.constants.O_NOFOLLOW;
  }
  const descriptor = fs.openSync(directory, flags);
  try {
    const stat = fs.fstatSync(descriptor, { bigint: true });
    const pathStat = fs.lstatSync(directory, { bigint: true });
    if (!stat.isDirectory() || pathStat.isSymbolicLink() ||
        !pathStat.isDirectory() || !samePrivateIdentity(stat, pathStat)) {
      throw rstestError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage manifest parent identity changed: ${directory}`,
      );
    }
    return { descriptor, stat };
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}

function verifyPrivateDirectory(directory, expected) {
  const current = openPrivateDirectory(directory);
  try {
    if (!samePrivateIdentity(current.stat, expected)) {
      throw rstestError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage manifest parent identity changed: ${directory}`,
      );
    }
  } finally {
    if (current.descriptor !== undefined) fs.closeSync(current.descriptor);
  }
}

function assertPrivateFileIdentity(filename, expected) {
  let stat;
  try {
    stat = fs.lstatSync(filename, { bigint: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw rstestError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage manifest path changed: ${filename}`,
      );
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() ||
      !samePrivateIdentity(stat, expected)) {
    throw rstestError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      `Coverage manifest path identity changed: ${filename}`,
    );
  }
}

const PUBLISH_PRIVATE_JSON_SCRIPT = `
  const fs = require('node:fs');
  const expectedDevice = BigInt(process.argv[1]);
  const expectedInode = BigInt(process.argv[2]);
  const source = process.argv[3];
  const destination = process.argv[4];
  let descriptor;
  try {
    let parent;
    if (Number.isInteger(fs.constants.O_DIRECTORY)) {
      let flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY;
      if (Number.isInteger(fs.constants.O_NOFOLLOW) && fs.constants.O_NOFOLLOW) {
        flags |= fs.constants.O_NOFOLLOW;
      }
      descriptor = fs.openSync('.', flags);
      parent = fs.fstatSync(descriptor, { bigint: true });
    } else {
      parent = fs.lstatSync('.', { bigint: true });
    }
    if (!parent.isDirectory() || parent.dev !== expectedDevice ||
        parent.ino !== expectedInode) process.exit(73);
    const sourceStat = fs.lstatSync(source, { bigint: true });
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) process.exit(73);
    try {
      fs.linkSync(source, destination);
    } catch (error) {
      if (error.code === 'EEXIST') process.exit(74);
      throw error;
    }
    const destinationStat = fs.lstatSync(destination, { bigint: true });
    if (!destinationStat.isFile() || destinationStat.isSymbolicLink() ||
        destinationStat.dev !== sourceStat.dev ||
        destinationStat.ino !== sourceStat.ino) {
      try {
        const current = fs.lstatSync(destination, { bigint: true });
        if (current.dev === sourceStat.dev && current.ino === sourceStat.ino) {
          fs.unlinkSync(destination);
        }
      } catch {}
      process.exit(73);
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
`;

function publishPrivateJson(directory, temporary, filename, parentStat) {
  const result = childProcess.spawnSync(process.execPath, [
    '-e',
    PUBLISH_PRIVATE_JSON_SCRIPT,
    parentStat.dev.toString(),
    parentStat.ino.toString(),
    path.basename(temporary),
    path.basename(filename),
  ], { cwd: directory, encoding: 'utf8' });
  if (result.status === 74) {
    throw rstestError(
      'METEOR_RSTEST_COVERAGE_REPLAY',
      `Coverage manifest path was already used: ${filename}`,
    );
  }
  if (result.error || result.status !== 0) {
    throw rstestError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      'Coverage manifest parent changed during atomic publication.',
    );
  }
}

function writePrivateJsonAtomic(filename, value) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > MAX_PRIVATE_JSON_BYTES) {
    throw rstestError(
      'METEOR_RSTEST_COVERAGE_OVERSIZED',
      'Coverage manifest exceeds the 64 MiB limit.',
    );
  }
  const directory = path.dirname(filename);
  assertNoSymlinkParents(directory, true);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertNoSymlinkParents(directory, false);
  fs.chmodSync(directory, 0o700);
  const parent = openPrivateDirectory(directory);
  const temporary = path.join(
    directory,
    `.${path.basename(filename)}.${process.pid}.${Date.now()}.tmp`,
  );
  let descriptor;
  let temporaryStat;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    temporaryStat = fs.fstatSync(descriptor, { bigint: true });
    verifyPrivateDirectory(directory, parent.stat);
    assertPrivateFileIdentity(temporary, temporaryStat);
    fs.writeFileSync(descriptor, serialized);
    fs.fsyncSync(descriptor);
    fs.fchmodSync(descriptor, 0o600);
    assertNoSymlinkParents(directory, false);
    publishPrivateJson(directory, temporary, filename, parent.stat);
    verifyPrivateDirectory(directory, parent.stat);
    assertPrivateFileIdentity(temporary, temporaryStat);
    assertPrivateFileIdentity(filename, temporaryStat);
    fs.unlinkSync(temporary);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (parent.descriptor !== undefined) fs.closeSync(parent.descriptor);
    try {
      const current = fs.lstatSync(temporary, { bigint: true });
      if (temporaryStat && samePrivateIdentity(current, temporaryStat)) {
        fs.unlinkSync(temporary);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function selectedCount(inventory) {
  return inventory.pureFiles.length +
    inventory.runtimeFiles.length +
    inventory.externalFiles.length;
}

function collectPackageRstestFiles(packageTests = []) {
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.npm' ||
          entry.name === '.git') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && RSTEST_TEST_FILE.test(entry.name)) {
        files.push(file);
      }
    }
  };
  for (const packageTest of packageTests) {
    if (!packageTest || typeof packageTest.sourceRoot !== 'string' ||
        !path.isAbsolute(packageTest.sourceRoot) ||
        !fs.existsSync(packageTest.sourceRoot)) continue;
    visit(packageTest.sourceRoot);
  }
  return [...new Set(files.map(file => path.resolve(file)))].sort();
}

function createPackageRuntimeMirrors({ harnessRoot, files, packageTests }) {
  const root = path.join(harnessRoot, '.rstest-package-runtime');
  fs.mkdirSync(root, { recursive: true });
  const buildRoot = path.join(harnessRoot, '_build', 'test');
  fs.mkdirSync(buildRoot, { recursive: true });
  for (const side of ['client', 'server']) {
    const wrapper = path.join(buildRoot, `${side}-meteor.js`);
    if (!fs.existsSync(wrapper)) fs.writeFileSync(wrapper, '\n');
  }
  return files.map((source, index) => {
    const owner = packageTests
      .filter(packageTest => {
        if (!packageTest || typeof packageTest.sourceRoot !== 'string') return false;
        const relative = path.relative(packageTest.sourceRoot, source);
        return relative !== '' && relative !== '..' &&
          !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      })
      .sort((left, right) => right.sourceRoot.length - left.sourceRoot.length)[0];
    const packageName = owner
      ? owner.name.replace(/^local-test:/, '').replace(/[^A-Za-z0-9_.-]/g, '-')
      : `package-${String(index).padStart(4, '0')}`;
    const relative = owner
      ? path.relative(owner.sourceRoot, source)
      : path.basename(source);
    const mirror = path.join(root, packageName, relative);
    fs.mkdirSync(path.dirname(mirror), { recursive: true });
    fs.writeFileSync(
      mirror,
      `import ${JSON.stringify(source.split(path.sep).join('/'))};\n`,
    );
    return mirror;
  });
}

function getPackageHarnessDevDependencies(
  env = process.env,
  { coverage = false } = {},
) {
  const spec = env.METEOR_RSPACK_NPM_SPEC;
  return {
    ...(typeof spec === 'string' && spec.trim() && {
      '@meteorjs/rspack': spec,
    }),
    ...(coverage && {
      '@rstest/coverage-istanbul': '0.11.6',
    }),
  };
}

function requestsVerboseReporter(args = []) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = String(args[index]);
    const inline = /^--reporters?=(.+)$/.exec(argument);
    if (inline && inline[1] === 'verbose') return true;
    if (/^--reporters?$/.test(argument) &&
        String(args[index + 1]) === 'verbose') {
      return true;
    }
  }
  return false;
}

function resolveRstestCoverageInstrumentation(npmRoot) {
  const appRequire = createRequire(path.join(path.resolve(npmRoot), 'package.json'));
  const coordinatorEntry = appRequire.resolve('@meteorjs/rstest');
  const coordinatorRequire = createRequire(coordinatorEntry);
  const coverageProviderEntry = coordinatorRequire.resolve(
    '@rstest/coverage-istanbul',
  );
  return {
    swcPlugin: createRequire(coverageProviderEntry).resolve(
      'swc-plugin-coverage-instrument',
    ),
    babelPlugin: coordinatorRequire.resolve('babel-plugin-istanbul'),
  };
}

function collectLocalPackageTransforms(localPackages, packageTests) {
  const packageRoots = {};
  const includePackages = [];
  for (const entry of [...localPackages || [], ...packageTests || []]) {
    if (!entry || typeof entry.name !== 'string' ||
        entry.sourceKind === 'checkout' ||
        !path.isAbsolute(entry.sourceRoot || '') ||
        Object.hasOwn(packageRoots, entry.name)) continue;
    packageRoots[entry.name] = entry.sourceRoot;
    includePackages.push(entry.name);
  }
  return { packageRoots, includePackages };
}

class RstestTestRunnerProvider {
  constructor(context, services = {}) {
    this.context = context;
    this.upstreamRuntime = true;
    this.services = {
      ensureRstestInstalled,
      assertRstestOptionalCapabilities,
      selectRstestOptionalCapabilities,
      inspectAppRstestCapability,
      scanRstestCandidates,
      scanNativeRstestRoots,
      selectRstestInventory,
      selectRstestLanes,
      startRstestProcess,
      Browser: RstestBrowser,
      External: RstestExternal,
      aggregateRstestWorkerResults,
      createRstestHostDescriptors,
      validateRstestWorkerPayload,
      resolveRstestCoverageInstrumentation,
      env: process.env,
      warn: message => console.warn(message),
      ...services,
    };
    this.resources = [];
    this.selection = null;
    this.plan = null;
    this.stopped = false;
    this.generation = 1;
    this.verbose = Boolean(context.verbose);
    this.reportVerbose = this.verbose || requestsVerboseReporter(
      context.options.passthrough
    );
    this.smartCandidates = [];
    this.routingManifest = null;
    this.classification = null;
    this.completionPromise = null;
  }

  async validate() {
    const { command, appDir, options } = this.context;
    if (options.serverOnly && options.clientOnly) {
      throw rstestError(
        'METEOR_RSTEST_CONFLICTING_SIDES',
        '--server-only conflicts with --client-only.'
      );
    }
    if (!options.once && (options.shard || options.changed || options.changedSince)) {
      throw rstestError(
        'METEOR_RSTEST_ONCE_REQUIRED',
        '--shard and --changed require --once.'
      );
    }
    const protectedArgument = options.passthrough.find(argument =>
      /^(?:--config(?:=|$)|-c(?:=|$)|--root(?:=|$)|--project(?:=|$)|--passWithNoTests(?:=|$))/.test(
        String(argument)
      )
    );
    if (protectedArgument) {
      throw rstestError(
        'METEOR_RSTEST_PROTECTED_ARGUMENT',
        `${protectedArgument} is Meteor-owned and cannot be passed after --.`
      );
    }

    if (command === 'test-packages') {
      const unsupported = PACKAGE_UNSUPPORTED_OPTIONS.filter(
        ([key]) => options[key] && [].concat(options[key]).length > 0
      );
      if (unsupported.length > 0) {
        throw rstestError(
          'METEOR_RSTEST_UNSUPPORTED_PACKAGE_OPTION',
          `meteor test-packages does not support ${unsupported.map(
            ([, flag]) => flag
          ).join(', ')}.`
        );
      }
      const runtimeFiles = collectPackageRstestFiles(
        this.context.packageTests,
      );
      if (runtimeFiles.length === 0) {
        throw rstestError(
          'METEOR_RSTEST_PACKAGE_TESTS_NOT_FOUND',
          'Selected Rstest packages contain no *.test.*, *.tests.*, *.spec.*, or *.specs.* files.'
        );
      }
      this.selection = {
        capability: { hasRstestConfig: false },
        inventory: {
          pureFiles: [],
          runtimeFiles,
          externalFiles: [],
          compatibilityFiles: [],
          unknownProjects: [],
        },
        needsRuntime: true,
        needsExternal: false,
        shouldRunNative: true,
        nativeProjects: [],
        nativeServer: !options.clientOnly,
        nativeClient: !options.serverOnly,
      };
      return;
    }

    const capability = this.services.inspectAppRstestCapability(appDir);
    const roots = this.services.scanNativeRstestRoots(appDir, {
      fullApp: options.fullApp,
    });
    const candidateInventory = this.services.scanRstestCandidates(appDir, {
      fullApp: options.fullApp,
    });
    const explicitProjects = options.project;
    if (options.serverOnly && explicitProjects.some(name => CLIENT_PROJECTS.has(name)) ||
        options.clientOnly && explicitProjects.some(name => SERVER_PROJECTS.has(name))) {
      throw rstestError(
        'METEOR_RSTEST_PROJECT_SIDE_CONFLICT',
        `--project ${explicitProjects.join(', ')} conflicts with ` +
          `${options.serverOnly ? '--server-only' : '--client-only'}.`
      );
    }
    const laneProjects = explicitProjects.length > 0
      ? explicitProjects
      : options.serverOnly
        ? ['meteor-pure-server', 'meteor-runtime-server']
        : options.clientOnly
          ? ['meteor-pure-client', 'meteor-browser', 'meteor-runtime-client']
          : [];
    const inventory = this.services.selectRstestInventory({
      appDir,
      roots,
      projects: laneProjects,
      testFile: options.testFile,
    });
    const selectedCompatibility = new Set(inventory.compatibilityFiles);
    const usesGeneratedProject = explicitProjects.length === 0 ||
      explicitProjects.some(project => GENERATED_PROJECTS.has(project));
    this.smartCandidates = usesGeneratedProject
      ? candidateInventory.candidateFiles.filter(file =>
        selectedCompatibility.has(file)
      )
      : [];
    const explicitlyRequestsExternal = explicitProjects.includes('meteor-e2e') ||
      Boolean(options.testFile.length > 0 && inventory.externalFiles.length > 0);
    if (explicitlyRequestsExternal && !options.fullApp) {
      throw rstestError(
        'METEOR_RSTEST_FULL_APP_REQUIRED',
        'meteor-e2e requires --full-app.'
      );
    }
    if (!options.fullApp) inventory.externalFiles = [];
    const count = selectedCount(inventory);
    const hasUnknownProject = inventory.unknownProjects.length > 0;
    if (explicitProjects.length > 0 && !hasUnknownProject && count === 0 &&
        this.smartCandidates.length === 0) {
      throw rstestError(
        'METEOR_RSTEST_EMPTY_PROJECT',
        `Project ${explicitProjects.join(', ')} has no matching tests.`
      );
    }
    if (options.testFile.length > 0 && count === 0 &&
        this.smartCandidates.length === 0 && !hasUnknownProject &&
        !(inventory.compatibilityFiles.length > 0 && capability.hasRstestConfig)) {
      throw rstestError(
        inventory.compatibilityFiles.length > 0
          ? 'METEOR_RSTEST_COMPATIBILITY_OWNED'
          : 'METEOR_RSTEST_EMPTY_FILE_SELECTION',
        inventory.compatibilityFiles.length > 0
          ? `--test-file ${options.testFile.join(', ')} is compatibility-owned.`
          : `--test-file ${options.testFile.join(', ')} matched no selected test.`
      );
    }
    if (count === 0 && this.smartCandidates.length === 0 && !hasUnknownProject &&
        !capability.hasRstestConfig && roots.legacyFiles.length > 0) {
      throw rstestError(
        'METEOR_RSTEST_NO_OWNED_TESTS',
        `Found ${roots.legacyFiles.length} existing Meteor test file(s), ` +
          'but no tests under tests/rstest.'
      );
    }
    const lanes = this.services.selectRstestLanes(laneProjects);
    const nativeProjects = explicitProjects.filter(name =>
      !name.startsWith('meteor-runtime-') && name !== 'meteor-e2e'
    );
    let nativeServer = !options.clientOnly;
    let nativeClient = !options.serverOnly;
    if (!options.serverOnly && !options.clientOnly && nativeProjects.length > 0) {
      if (nativeProjects.every(name => name === 'meteor-pure-server')) {
        nativeClient = false;
      } else if (nativeProjects.every(name =>
        name === 'meteor-pure-client' || name === 'meteor-browser'
      )) {
        nativeServer = false;
      }
    }
    let needsRuntime = lanes.runtime && inventory.runtimeFiles.length > 0;
    let needsExternal = lanes.external && inventory.externalFiles.length > 0;
    let shouldRunNative = lanes.native && (
      options.testFile.length === 0 ||
      inventory.pureFiles.length > 0 ||
      capability.hasRstestConfig && inventory.compatibilityFiles.length > 0 ||
      hasUnknownProject
    );
    if (this.context.worker) {
      this.workerPayload = this.services.validateRstestWorkerPayload({
        appDir,
        worker: this.context.worker,
      });
      const selectedRuntimeFiles = new Set([
        ...inventory.runtimeFiles,
        ...candidateInventory.candidateFiles,
      ].map(file => fs.realpathSync(file)));
      const unselected = this.workerPayload.runtimeFiles.find(
        file => !selectedRuntimeFiles.has(file)
      );
      if (unselected) {
        throw rstestError(
          'METEOR_RSTEST_WORKER_FILE_SELECTION',
          `Worker file is outside parent command selection: ${unselected}`
        );
      }
      inventory.pureFiles = [];
      inventory.runtimeFiles = [...this.workerPayload.runtimeFiles];
      inventory.externalFiles = [];
      needsRuntime = true;
      needsExternal = false;
      shouldRunNative = false;
    }
    if (needsRuntime && (options.shard || options.changed || options.changedSince)) {
      throw rstestError(
        'METEOR_RSTEST_RUNTIME_OPTION_UNSUPPORTED',
        '--shard and --changed are not supported for Meteor-runtime projects.'
      );
    }
    if (needsExternal && !options.once) {
      throw rstestError(
        'METEOR_RSTEST_EXTERNAL_ONCE_REQUIRED',
        'External E2E projects require --once.'
      );
    }
    if (!this.context.worker && options.runtimeWorkers > 1 && !needsRuntime &&
        this.smartCandidates.length === 0) {
      throw rstestError(
        'METEOR_RSTEST_RUNTIME_WORKERS_EMPTY',
        '--runtime-workers requires selected tests/rstest/runtime/server files.'
      );
    }
    this.selection = {
      capability,
      inventory,
      needsRuntime,
      needsExternal,
      shouldRunNative,
      nativeProjects,
      nativeServer,
      nativeClient,
    };
  }

  async _classifySmartCandidates(runtimeDir) {
    const { appDir, localDir, npm, options } = this.context;
    if (typeof this.services.classifyRstestCandidates === 'function') {
      return this.services.classifyRstestCandidates({
        appRoot: appDir,
        candidates: this.smartCandidates,
        server: !options.clientOnly,
        client: !options.serverOnly,
      });
    }
    const candidateManifest = path.join(runtimeDir, 'classification-candidates.json');
    const classificationOutput = path.join(runtimeDir, 'classification.json');
    fs.writeFileSync(candidateManifest, JSON.stringify(this.smartCandidates));
    removeIfPresent(classificationOutput);
    const process = this.services.startRstestProcess({
      appDir,
      packageRoot: npm.root,
      args: buildRstestArgs({
        appDir,
        localDir,
        once: true,
        command: 'test',
        server: !options.clientOnly,
        client: !options.serverOnly,
        candidateManifest,
        classificationOutput,
      }),
    });
    const code = await process.completion;
    if (code !== 0) {
      throw rstestError(
        'METEOR_RSTEST_CLASSIFICATION_FAILED',
        `Rstest dependency classification exited with status ${code}.`,
      );
    }
    return JSON.parse(fs.readFileSync(classificationOutput, 'utf8'));
  }

  _applySmartClassification(classification, runtimeDir) {
    const { options } = this.context;
    const selection = this.selection;
    const inventory = selection.inventory;
    const arrays = [
      'nativeNodeFiles', 'nativeDomFiles', 'browserFiles',
      'runtimeServerFiles', 'runtimeClientFiles', 'externalFiles', 'legacyFiles',
    ];
    if (!classification || classification.schemaVersion !== 1 ||
        arrays.some(field => !Array.isArray(classification[field]))) {
      throw rstestError(
        'METEOR_RSTEST_INVALID_CLASSIFICATION',
        'Rstest dependency classification returned an invalid manifest.',
      );
    }
    const oldNode = inventory.pureFiles.filter(file =>
      /[\\/]tests[\\/]rstest[\\/]pure[\\/]server[\\/]/.test(file)
    );
    const oldDom = inventory.pureFiles.filter(file =>
      /[\\/]tests[\\/]rstest[\\/]pure[\\/]client[\\/]/.test(file)
    );
    const oldBrowser = inventory.pureFiles.filter(file =>
      /[\\/]tests[\\/]rstest[\\/]browser[\\/]/.test(file)
    );
    const oldRuntimeServer = inventory.runtimeFiles.filter(file =>
      /[\\/]tests[\\/]rstest[\\/]runtime[\\/]server[\\/]/.test(file)
    );
    const oldRuntimeClient = inventory.runtimeFiles.filter(file =>
      /[\\/]tests[\\/]rstest[\\/]runtime[\\/]client[\\/]/.test(file)
    );
    const selectedProjects = new Set(options.project);
    const accepts = project => selectedProjects.size === 0 ||
      selectedProjects.has(project);
    const unique = values => [...new Set(values.map(file => path.resolve(file)))].sort();
    const routing = {
      schemaVersion: 1,
      nativeNodeFiles: accepts('meteor-pure-server') && !options.clientOnly
        ? unique([...oldNode, ...classification.nativeNodeFiles]) : [],
      nativeDomFiles: accepts('meteor-pure-client') && !options.serverOnly
        ? unique([...oldDom, ...classification.nativeDomFiles]) : [],
      browserFiles: accepts('meteor-browser') && !options.serverOnly
        ? unique([...oldBrowser, ...classification.browserFiles]) : [],
      runtimeServerFiles: accepts('meteor-runtime-server') && !options.clientOnly
        ? unique([...oldRuntimeServer, ...classification.runtimeServerFiles]) : [],
      runtimeClientFiles: accepts('meteor-runtime-client') && !options.serverOnly
        ? unique([...oldRuntimeClient, ...classification.runtimeClientFiles]) : [],
      externalFiles: accepts('meteor-e2e')
        ? unique([...inventory.externalFiles, ...classification.externalFiles]) : [],
      legacyFiles: unique(classification.legacyFiles),
    };
    this.routingManifest = path.join(runtimeDir, 'routing-manifest.json');
    fs.writeFileSync(this.routingManifest, JSON.stringify(routing));
    this.classification = routing;

    inventory.pureFiles = unique([
      ...routing.nativeNodeFiles,
      ...routing.nativeDomFiles,
      ...routing.browserFiles,
    ]);
    inventory.runtimeFiles = unique([
      ...routing.runtimeServerFiles,
      ...routing.runtimeClientFiles,
    ]);
    inventory.externalFiles = [...routing.externalFiles];
    selection.needsRuntime = inventory.runtimeFiles.length > 0;
    selection.needsExternal = options.fullApp && inventory.externalFiles.length > 0;
    const delegatesToUserConfig = options.project.length === 0 &&
      selection.capability.hasRstestConfig &&
      routing.legacyFiles.length > 0;
    selection.shouldRunNative = inventory.pureFiles.length > 0 ||
      inventory.unknownProjects.length > 0 || delegatesToUserConfig;
    selection.nativeServer = !options.clientOnly && routing.nativeNodeFiles.length > 0;
    selection.nativeClient = !options.serverOnly && (
      routing.nativeDomFiles.length > 0 || routing.browserFiles.length > 0
    );
    if (options.project.length === 0) {
      selection.nativeProjects = [
        ...(routing.nativeNodeFiles.length > 0 ? ['meteor-pure-server'] : []),
        ...(routing.nativeDomFiles.length > 0 ? ['meteor-pure-client'] : []),
        ...(routing.browserFiles.length > 0 ? ['meteor-browser'] : []),
      ];
    }
    if (inventory.externalFiles.length > 0 && !options.fullApp) {
      throw rstestError(
        'METEOR_RSTEST_FULL_APP_REQUIRED',
        'Rstest E2E tests require --full-app.',
      );
    }
    if (inventory.pureFiles.length === 0 && inventory.runtimeFiles.length === 0 &&
        inventory.externalFiles.length === 0 &&
        inventory.unknownProjects.length === 0 && !delegatesToUserConfig) {
      throw rstestError(
        'METEOR_RSTEST_NO_OWNED_TESTS',
        `Found ${routing.legacyFiles.length} existing test file(s), but none are Rstest-owned.`,
      );
    }
    if (selection.needsRuntime &&
        (options.shard || options.changed || options.changedSince)) {
      throw rstestError(
        'METEOR_RSTEST_RUNTIME_OPTION_UNSUPPORTED',
        '--shard and --changed are not supported for Meteor-runtime projects.',
      );
    }
    if (options.runtimeWorkers > 1 && !selection.needsRuntime) {
      throw rstestError(
        'METEOR_RSTEST_RUNTIME_WORKERS_EMPTY',
        '--runtime-workers requires selected Meteor-runtime tests.',
      );
    }
    if (selection.needsExternal && !options.once) {
      throw rstestError(
        'METEOR_RSTEST_EXTERNAL_ONCE_REQUIRED',
        'External E2E projects require --once.',
      );
    }
  }

  async prepare() {
    if (this.plan) return this.plan;
    if (!this.selection) await this.validate();

    const {
      command,
      appDir,
      harnessRoot,
      localDir,
      architectures,
      options,
      npm,
      worker,
    } = this.context;
    const verbose = this.verbose;
    const reportVerbose = this.reportVerbose;
    if (command === 'test-packages') {
      await npm.ensureHarnessManifest({
        additionalDevDependencies: getPackageHarnessDevDependencies(
          this.services.env,
          { coverage: options.coverage },
        ),
        persistMeteorConfig: {
          mainModule: {
            client: '_build/test/client-meteor.js',
            server: '_build/test/server-meteor.js',
          },
        },
      });
    }
    if (!worker && npm.autoInstall) {
      await this.services.ensureRstestInstalled({
        env: { ...process.env, METEOR_RSTEST_NPM_ROOT: npm.root },
      });
    }

    const runtimeDir = path.join(localDir, 'rstest');
    fs.mkdirSync(runtimeDir, { recursive: true });
    const selection = this.selection;
    if (!worker && this.smartCandidates.length > 0) {
      this._applySmartClassification(
        await this._classifySmartCandidates(runtimeDir),
        runtimeDir,
      );
    }
    if (!worker) {
      const capabilities = this.services.selectRstestOptionalCapabilities({
        command,
        inventory: selection.inventory,
        coverage: options.coverage,
        client: selection.nativeClient,
      });
      this.services.assertRstestOptionalCapabilities({
        appDir,
        capabilities,
      });
    }
    const mixedCoverage = !worker && options.coverage === true && (
      selection.needsRuntime || selection.needsExternal
    );
    this.coverageGeneration = worker
      ? this.workerPayload.coverageGeneration || null
      : mixedCoverage
        ? crypto.randomBytes(16).toString('hex')
        : null;
    this.coverageRoot = this.coverageGeneration
      ? worker
        ? path.dirname(this.workerPayload.coveragePath)
        : path.join(runtimeDir, 'coverage', this.coverageGeneration)
      : null;
    this.coveragePlanPath = this.coverageRoot
      ? path.join(this.coverageRoot, 'plan.json')
      : null;
    this.coverageManifestPath = this.coverageRoot && !worker
      ? path.join(this.coverageRoot, 'manifest.json')
      : null;
    this.coverageNativeArtifactPath = !worker && this.coverageRoot &&
      command !== 'test-packages' && selection.shouldRunNative
      ? path.join(this.coverageRoot, 'native.json')
      : null;
    if (this.coverageRoot) {
      fs.mkdirSync(this.coverageRoot, { recursive: true, mode: 0o700 });
      fs.chmodSync(this.coverageRoot, 0o700);
    }
    const token = crypto.randomBytes(24).toString('base64url');
    this.runtimeSettingsPath = worker
      ? this.workerPayload.runtimeSettingsPath
      : selection.needsRuntime || selection.needsExternal
        ? path.join(runtimeDir, command === 'test-packages'
          ? 'package-runtime-plan.json'
          : 'app-runtime-settings.json')
        : null;
    this.runtimeSettingsGeneration = worker
      ? this.workerPayload.generation
      : selection.needsRuntime || selection.needsExternal
        ? crypto.randomBytes(16).toString('hex')
        : null;
    if (!worker && this.runtimeSettingsPath) {
      removeIfPresent(this.runtimeSettingsPath);
    }

    this.runtimeManifest = worker ? this.workerPayload.runtimeManifest : null;
    if (!worker && command === 'test-packages') {
      const packageRuntimeFiles = createPackageRuntimeMirrors({
        harnessRoot,
        files: selection.inventory.runtimeFiles,
        packageTests: this.context.packageTests,
      });
      this.runtimeManifest = path.join(runtimeDir, 'package-runtime-files.json');
      fs.writeFileSync(this.runtimeManifest, JSON.stringify({
        schemaVersion: 2,
        discoveryRoot: path.join(harnessRoot, '.rstest-package-runtime'),
        testFileRoot: '',
        serverFiles: packageRuntimeFiles,
        clientFiles: packageRuntimeFiles,
      }));
    }
    if (!worker && command === 'test' &&
        selection.inventory.runtimeFiles.length > 0) {
      this.runtimeManifest = path.join(runtimeDir, 'runtime-files.json');
      fs.writeFileSync(
        this.runtimeManifest,
        JSON.stringify(this.classification ? {
          schemaVersion: 2,
          serverFiles: this.classification.runtimeServerFiles,
          clientFiles: this.classification.runtimeClientFiles,
        } : selection.inventory.runtimeFiles)
      );
    }
    this.externalResultPath = !worker && selection.needsExternal
      ? path.join(runtimeDir, 'external-result.json')
      : null;
    if (this.externalResultPath) removeIfPresent(this.externalResultPath);

    const commonArgs = {
      appDir,
      localDir,
      once: options.once,
      verbose,
      fullApp: options.fullApp,
      server: selection.nativeServer,
      client: selection.nativeClient,
      command,
      config: options.config,
      testNamePattern: options.testNamePattern,
      browser: options.browser,
      coverage: options.coverage,
      updateSnapshots: options.updateSnapshots,
      shard: options.shard,
      changed: options.changed,
      changedSince: options.changedSince,
      phase: 'native',
      routingManifest: this.routingManifest,
      coveragePlanOutput: this.coveragePlanPath,
      coverageGeneration: this.coverageGeneration,
      passthrough: options.passthrough,
    };
    const serverArchitecture = architectures.find(architecture =>
      architecture === 'os' || architecture.startsWith('os.')
    );
    const browserArchitecture = this.context.webArchs.find(
      architecture => architecture === 'web.browser'
    ) || this.context.webArchs.find(architecture =>
      architecture === 'web.browser.legacy'
    );
    const selectedArchitectures = ({ server: includeServer, client: includeClient }) => [
      ...(includeServer && serverArchitecture ? [serverArchitecture] : []),
      ...(includeClient && browserArchitecture ? [browserArchitecture] : []),
    ];
    this.nativeArgs = buildRstestArgs({
      ...commonArgs,
      coverageArtifact: this.coverageNativeArtifactPath,
      harnessRoot: command === 'test-packages' ? harnessRoot : undefined,
      project: command === 'test' ? selection.nativeProjects : [],
      testFile: command === 'test' && !this.routingManifest
        ? options.testFile
        : [],
      passWithNoTests: command === 'test' &&
        options.project.length === 0 && options.testFile.length === 0 &&
        (selection.needsRuntime || selection.needsExternal),
      runtimePlanOutput: command === 'test-packages'
        ? this.runtimeSettingsPath
        : undefined,
      runtimeSettingsOutput: command === 'test'
        ? this.runtimeSettingsPath
        : undefined,
      runtimeSettingsGeneration: command === 'test'
        ? this.runtimeSettingsGeneration
        : undefined,
      architectures: selectedArchitectures({
        server: selection.nativeServer,
        client: selection.nativeClient,
      }),
    });
    this.runtimePlanArgs = command === 'test' &&
      (selection.needsRuntime || selection.needsExternal) &&
      !selection.shouldRunNative
      ? buildRstestArgs({
        appDir,
        localDir,
        once: true,
        fullApp: options.fullApp,
        server: !options.clientOnly,
        client: !options.serverOnly,
        command,
        config: options.config,
        runtimePlanOutput: this.runtimeSettingsPath,
        runtimeSettingsGeneration: this.runtimeSettingsGeneration,
        architectures: selectedArchitectures({
          server: !options.clientOnly,
          client: !options.serverOnly,
        }),
        phase: 'native',
        routingManifest: this.routingManifest,
        coverage: options.coverage,
        coveragePlanOutput: this.coveragePlanPath,
        coverageGeneration: this.coverageGeneration,
      })
      : null;
    this.externalArgs = selection.needsExternal
      ? buildRstestArgs({
        ...commonArgs,
        once: true,
        project: 'meteor-e2e',
        testFile: this.routingManifest ? [] : options.testFile,
        resultOutput: this.externalResultPath,
        phase: 'external',
        routingManifest: this.routingManifest,
        architectures: selectedArchitectures({
          server: !options.clientOnly,
          client: !options.serverOnly,
        }),
      })
      : null;

    const hasDesktopBrowser = this.context.webArchs.some(arch =>
      arch === 'web.browser' || arch === 'web.browser.legacy'
    );
    const dedicatedRuntimeHosts = !worker && selection.needsRuntime && (
      options.runtimeWorkers > 1 ||
      options.runtimeWorkers === 1 && selection.needsExternal
    );
    const runtimeClient = worker
      ? this.workerPayload.clientFiles.length > 0
      : dedicatedRuntimeHosts
        ? false
      : command === 'test-packages'
        ? !options.serverOnly
      : this.classification
        ? this.classification.runtimeClientFiles.length > 0
        : selection.inventory.runtimeFiles.some(file =>
          /[\\/]runtime[\\/]client[\\/]/.test(file)
        );
    const runtimeServer = worker
      ? this.workerPayload.serverFiles.length > 0
      : dedicatedRuntimeHosts
        ? false
      : command === 'test-packages'
        ? !options.clientOnly
      : this.classification
        ? this.classification.runtimeServerFiles.length > 0
        : selection.inventory.runtimeFiles.some(file =>
          /[\\/]runtime[\\/]server[\\/]/.test(file)
        );
    const client = !options.serverOnly && hasDesktopBrowser && (
      command === 'test-packages' || selection.needsRuntime && runtimeClient ||
      selection.needsExternal
    );
    const server = !options.clientOnly && (
      command === 'test-packages' || selection.needsRuntime && runtimeServer ||
      selection.needsExternal
    );
    if (!hasDesktopBrowser && !options.serverOnly &&
        (command === 'test-packages' || selection.needsRuntime && runtimeClient ||
          selection.needsExternal)) {
      throw rstestError(
        'METEOR_RSTEST_DESKTOP_BROWSER_REQUIRED',
        'Selected client tests require web.browser or web.browser.legacy.'
      );
    }

    this.metadata = {
      command,
      appRoot: appDir,
      generation: this.generation,
      watch: !options.once,
      verbose,
      reportVerbose,
      testNamePattern: options.testNamePattern || null,
      updateSnapshot: options.updateSnapshots ? 'all' : 'none',
      testTimeout: RUNTIME_SETTING_DEFAULTS.testTimeout,
      hookTimeout: RUNTIME_SETTING_DEFAULTS.hookTimeout,
      maxConcurrency: RUNTIME_SETTING_DEFAULTS.maxConcurrency,
      runtimeConfig: { ...RUNTIME_SETTING_DEFAULTS },
      token,
      server,
      client,
      runtimeServer,
      runtimeClient,
      coverageServer: server,
      coverageClient: dedicatedRuntimeHosts ? false : client,
      runtime: selection.needsRuntime,
      upstreamRuntime: this.upstreamRuntime,
      external: selection.needsExternal,
      workerGate: Boolean(dedicatedRuntimeHosts && selection.needsExternal),
      runtimeManifest: this.runtimeManifest,
      worker: worker ? {
        id: worker.id,
        index: worker.index,
        total: worker.total,
        generation: this.workerPayload.generation,
        resultPath: this.workerPayload.resultPath,
        ...(this.workerPayload.coveragePath && {
          coveragePath: this.workerPayload.coveragePath,
          coverageGeneration: this.workerPayload.coverageGeneration,
        }),
      } : null,
    };
    this.workerHostPlan = null;
    if (dedicatedRuntimeHosts) {
      this.workerHostPlan = this.services.createRstestHostDescriptors({
        appDir,
        localDir,
        files: selection.inventory.runtimeFiles,
        clientFiles: this.classification
          ? this.classification.runtimeClientFiles
          : selection.inventory.runtimeFiles.filter(file =>
            /[\\/]runtime[\\/]client[\\/]/.test(file)
          ),
        requestedWorkers: options.runtimeWorkers,
        generation: this.runtimeSettingsGeneration,
        runtimeSettingsPath: this.runtimeSettingsPath,
        coverageRoot: this.coverageRoot || undefined,
      });
      if (this.workerHostPlan.actualWorkers < options.runtimeWorkers) {
        this.services.warn(
          `[Meteor Rstest] --runtime-workers capped from ${options.runtimeWorkers} ` +
          `to ${this.workerHostPlan.actualWorkers} selected runtime file(s).`
        );
      }
    }
    this.coverageArtifacts = [];
    if (this.coverageRoot) {
      if (this.coverageNativeArtifactPath) {
        this.coverageArtifacts.push({
          producer: 'native',
          path: this.coverageNativeArtifactPath,
        });
      }
      if (worker) {
        if (this.workerPayload.coveragePath) {
          this.coverageArtifacts.push({
            producer: `worker-${worker.id}`,
            path: this.workerPayload.coveragePath,
          });
        }
        if (this.workerPayload.clientFiles.length > 0) {
          this.coverageArtifacts.push({
            producer: 'client',
            path: path.join(this.coverageRoot, 'client.json'),
          });
        }
      } else if (this.workerHostPlan) {
        if (selection.needsExternal && server) {
          this.coverageArtifacts.push({
            producer: 'server',
            path: path.join(this.coverageRoot, 'server.json'),
          });
        }
        for (const descriptor of this.workerHostPlan.descriptors) {
          const producer = `worker-${descriptor.id}`;
          this.coverageArtifacts.push({
            producer,
            path: descriptor.payload.coveragePath,
          });
        }
        if (this.workerHostPlan.descriptors.some(descriptor => {
          const manifest = JSON.parse(fs.readFileSync(
            descriptor.payload.runtimeManifest,
            'utf8',
          ));
          return Array.isArray(manifest.clientFiles) && manifest.clientFiles.length > 0;
        })) {
          this.coverageArtifacts.push({
            producer: 'client',
            path: path.join(this.coverageRoot, 'client.json'),
          });
        }
      } else {
        if (server) {
          this.coverageArtifacts.push({
            producer: 'server',
            path: path.join(this.coverageRoot, 'server.json'),
          });
        }
        if (client) {
          this.coverageArtifacts.push({
            producer: 'client',
            path: path.join(this.coverageRoot, 'client.json'),
          });
        }
      }
      if (selection.needsExternal) {
        this.coverageArtifacts.push({
          producer: 'e2e',
          path: path.join(this.coverageRoot, 'e2e.json'),
        });
      }
    }
    const dependencyOnly = !selection.needsRuntime && !selection.needsExternal;
    const buildClient = client || selection.needsExternal && !options.serverOnly;
    const buildServer = server || selection.needsExternal && !options.clientOnly;
    const mode = this.workerHostPlan
        ? selection.needsExternal ? 'meteor-host' : 'native-only'
        : selection.needsRuntime || selection.needsExternal
        ? 'meteor-host'
        : 'native-only';
    const buildPluginOptions = {
      rspack: {
        autoInstall: npm.autoInstall,
        lifecycle: dependencyOnly ? 'dependencies-only' : 'runtime',
        ...(command === 'test-packages' && { projectRoot: harnessRoot }),
        ...(!dependencyOnly && {
          targets: { client: buildClient, server: buildServer },
        }),
        context: {
          testRunner: 'rstest',
          runtime: selection.needsRuntime,
          upstreamRuntime: this.upstreamRuntime,
          external: selection.needsExternal,
          server,
          client,
          runtimeManifest: this.runtimeManifest,
          runtimeSettingsPath: this.runtimeSettingsPath,
          npmRoot: npm.root,
          ...(this.coveragePlanPath && {
            coveragePlanPath: this.coveragePlanPath,
            coverageGeneration: this.coverageGeneration,
          }),
        },
      },
    };
    if (this.coveragePlanPath) {
      const transforms = collectLocalPackageTransforms(
        this.context.localPackages,
        this.context.packageTests,
      );
      if (transforms.includePackages.length > 0) {
        const { swcPlugin, babelPlugin } =
          this.services.resolveRstestCoverageInstrumentation(npm.root);
        const cacheKey = crypto.createHash('sha256').update(JSON.stringify({
          schemaVersion: 1,
          generation: this.coverageGeneration,
          planPath: this.coveragePlanPath,
        })).digest('hex');
        buildPluginOptions['babel-compiler'] = {
          sourceTransforms: {
            ...transforms,
            swcPlugins: [[swcPlugin, {}]],
            babelPlugins: [[babelPlugin, { cwd: appDir }]],
            cacheKey,
          },
        };
      }
    }
    this.plan = {
      mode,
      ...(mode === 'meteor-host' && command === 'test' && {
        hostTestMode: worker ? 'test'
          : selection.needsExternal
          ? this.workerHostPlan ? 'app-test'
            : selection.needsRuntime ? 'mixed' : 'app-test'
          : 'test',
      }),
      ...(mode === 'meteor-host' && { driverPackage: 'rstest' }),
      ...(command === 'test-packages' && {
        harnessPackages: ['ecmascript'],
        refreshProjectMetadata: true,
      }),
      metadata: this.metadata,
      buildPluginOptions,
    };
    return this.plan;
  }

  _readRuntimeSettings(updateMetadata) {
    const settings = JSON.parse(fs.readFileSync(this.runtimeSettingsPath, 'utf8'));
    if (this.context.command === 'test' &&
        (settings.schemaVersion !== 1 ||
          settings.generation !== this.runtimeSettingsGeneration)) {
      throw rstestError(
        'METEOR_RSTEST_STALE_SETTINGS',
        'Ignored stale runtime settings payload.'
      );
    }
    this.metadata.runtimeConfig = Object.fromEntries(
      Object.entries(RUNTIME_SETTING_DEFAULTS).map(([field, fallback]) => [
        field,
        settings[field] === undefined ? fallback : settings[field],
      ])
    );
    this.metadata.testTimeout = this.metadata.runtimeConfig.testTimeout;
    this.metadata.hookTimeout = this.metadata.runtimeConfig.hookTimeout;
    this.metadata.maxConcurrency = this.metadata.runtimeConfig.maxConcurrency;
    if (settings.coverage !== undefined) {
      this._setCoveragePlan(settings.coverage);
    }
    updateMetadata(this.metadata);
  }

  _setCoveragePlan(coverage) {
    if (!coverage || coverage.schemaVersion !== 1 || coverage.enabled !== true ||
        coverage.provider !== 'istanbul' ||
        coverage.generation !== this.coverageGeneration ||
        path.resolve(coverage.artifactRoot || '') !== this.coverageRoot) {
      throw rstestError(
        'METEOR_RSTEST_STALE_COVERAGE_PLAN',
        'Ignored an invalid or stale coverage plan.',
      );
    }
    this.coveragePlan = coverage;
    this.metadata.coverage = {
      ...coverage,
      token: this.metadata.token,
      endpoint: '/__meteor__/rstest/coverage',
      artifacts: Object.fromEntries(this.coverageArtifacts.map(artifact => [
        artifact.producer,
        artifact.path,
      ])),
    };
  }

  async _waitForRuntimeSettings(processHandle, updateMetadata) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try {
        this._readRuntimeSettings(updateMetadata);
        return;
      } catch {}
      const state = await Promise.race([
        new Promise(resolve => setTimeout(() => resolve(null), 50)),
        processHandle.completion.then(code => ({ code }), error => ({ error })),
      ]);
      if (state && state.error) throw state.error;
      if (state && state.code !== 0) {
        throw rstestError(
          'METEOR_RSTEST_NATIVE_EARLY_EXIT',
          `Native watcher exited with status ${state.code} before loading config.`
        );
      }
    }
    throw rstestError(
      'METEOR_RSTEST_SETTINGS_TIMEOUT',
      'Timed out waiting for runtime settings from rstest.config.'
    );
  }

  async startBeforeHost({ updateMetadata }) {
    const { command, appDir, harnessRoot, options } = this.context;
    const selection = this.selection;
    if (this.context.worker) {
      this._readRuntimeSettings(updateMetadata);
      return { exitCode: 0 };
    }
    if (command === 'test-packages') {
      const handle = this.services.startRstestProcess({
        appDir,
        packageRoot: harnessRoot,
        args: this.nativeArgs,
      });
      const code = await handle.completion;
      if (code === 0) this._readRuntimeSettings(updateMetadata);
      return { exitCode: code };
    }

    if (this.workerHostPlan) {
      const args = selection.shouldRunNative
        ? this.nativeArgs
        : this.runtimePlanArgs;
      const native = this.services.startRstestProcess({ appDir, args });
      const code = await native.completion;
      if (code !== 0) return { exitCode: code };
      this._readRuntimeSettings(updateMetadata);

      const startWorkers = () => {
        const workers = this.context.meteorHosts.start(
          this.workerHostPlan.descriptors,
          selection.needsExternal ? { basePort: this.context.basePort + 2 } : undefined,
        );
        this.resources.push(workers);
        return {
          completion: workers.completion.then(outcome => {
            const aggregate = this.services.aggregateRstestWorkerResults({
              descriptors: this.workerHostPlan.descriptors,
              outcome,
              verbose: this.metadata.reportVerbose,
            });
            this.workerAggregate = aggregate;
            return aggregate.exitCode;
          }),
          stop: signal => workers.stop(signal),
        };
      };
      if (selection.needsExternal) {
        let workerProcess;
        let resolveCompletion;
        let rejectCompletion;
        const completion = new Promise((resolve, reject) => {
          resolveCompletion = resolve;
          rejectCompletion = reject;
        });
        this.startDeferredWorkers = () => {
          if (workerProcess) return workerProcess;
          workerProcess = startWorkers();
          this.deferredWorkerProcess = workerProcess;
          workerProcess.completion.then(resolveCompletion, rejectCompletion);
          return workerProcess;
        };
        this.deferredWorkerCompletion = completion;
        return {};
      }
      return { process: startWorkers() };
    }

    if (selection.shouldRunNative) {
      const handle = this.services.startRstestProcess({
        appDir,
        args: this.nativeArgs,
      });
      if (options.once) {
        const code = await handle.completion;
        if (code === 0 && (selection.needsRuntime || selection.needsExternal)) {
          this._readRuntimeSettings(updateMetadata);
        }
        return { exitCode: code };
      }
      this.resources.push(handle);
      if (selection.needsRuntime) {
        await this._waitForRuntimeSettings(handle, updateMetadata);
      }
      return { process: handle };
    }

    if (selection.needsRuntime || selection.needsExternal) {
      const handle = this.services.startRstestProcess({
        appDir,
        args: this.runtimePlanArgs,
      });
      const code = await handle.completion;
      if (code === 0) this._readRuntimeSettings(updateMetadata);
      return { exitCode: code };
    }
    return { exitCode: 0 };
  }

  async beforeAppRun({ updateMetadata }) {
    if (this.metadata.watch) {
      this.generation += 1;
      this.metadata.generation = this.generation;
      updateMetadata(this.metadata);
    }
  }

  async startHost({ url, log }) {
    if (this.metadata.runtimeClient) {
      const browser = new this.services.Browser({
        appDir: this.context.appDir,
        url,
        browser: this.context.options.browser || 'chromium',
        token: this.metadata.token,
        log,
      });
      this.resources.push(browser);
      await browser.start();
    }
    if (this.metadata.external) {
      const externalCoverageArtifact = this.coverageArtifacts.find(
        artifact => artifact.producer === 'e2e',
      );
      const external = new this.services.External({
        appDir: this.context.appDir,
        packageRoot: this.context.npm.root,
        url,
        args: this.externalArgs,
        resultPath: this.externalResultPath,
        token: this.metadata.token,
        generation: this.generation,
        ...(this.metadata.coverage && externalCoverageArtifact ? {
          coverageGeneration: this.metadata.coverage.generation,
          coverageArtifactPath: externalCoverageArtifact.path,
          coverageShardDirectory: path.join(this.coverageRoot, 'e2e-shards'),
        } : {}),
      });
      this.resources.push(external);
      await external.start();
    }
    if (this.startDeferredWorkers) {
      const worker = this.startDeferredWorkers();
      await worker.completion;
      const endpoint = new URL('__meteor__/rstest/worker-complete', `${url.replace(/\/$/, '')}/`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-meteor-rstest-token': this.metadata.token,
          'x-meteor-rstest-generation': String(this.metadata.generation),
        },
      });
      if (!response.ok) {
        throw rstestError(
          'METEOR_RSTEST_WORKER_GATE',
          `Runtime worker completion endpoint returned HTTP ${response.status}.`,
        );
      }
    }
  }

  _loadCoveragePlanForCompletion() {
    if (this.coveragePlan) return this.coveragePlan;
    if (!this.coveragePlanPath || !fs.existsSync(this.coveragePlanPath)) {
      throw rstestError(
        'METEOR_RSTEST_STALE_COVERAGE_PLAN',
        'Coverage plan is missing, malformed, or stale.',
      );
    }
    let coverage;
    try {
      coverage = JSON.parse(fs.readFileSync(this.coveragePlanPath, 'utf8'));
    } catch {
      throw rstestError(
        'METEOR_RSTEST_STALE_COVERAGE_PLAN',
        'Coverage plan is missing, malformed, or stale.',
      );
    }
    this._setCoveragePlan(coverage);
    return coverage;
  }

  async _completeCoverageRun({ exitCode }) {
    if (this.context.worker) return undefined;
    try {
      if (this.deferredWorkerCompletion) {
        const workerExitCode = await this.deferredWorkerCompletion;
        if (exitCode === 0 && workerExitCode !== 0) exitCode = workerExitCode;
      }
      if (!this.coverageGeneration) {
        return exitCode === 0 ? undefined : { exitCode };
      }
      this._loadCoveragePlanForCompletion();
      const localPackages = [];
      const names = new Set();
      for (const entry of [
        ...this.context.localPackages || [],
        ...this.context.packageTests || [],
      ]) {
        if (!entry || typeof entry.name !== 'string' || names.has(entry.name) ||
            typeof entry.sourceRoot !== 'string') continue;
        names.add(entry.name);
        localPackages.push({
          name: entry.name,
          sourceRoot: entry.sourceRoot,
        });
      }
      writePrivateJsonAtomic(this.coverageManifestPath, {
        schemaVersion: 1,
        generation: this.coverageGeneration,
        appRoot: this.context.npm.root,
        localPackages,
        artifacts: this.coverageArtifacts,
        testExitCode: exitCode,
      });
      const handle = this.services.startRstestProcess({
        appDir: this.context.appDir,
        packageRoot: this.context.npm.root,
        args: buildRstestArgs({
          appDir: this.context.appDir,
          localDir: this.context.localDir,
          command: this.context.command,
          config: this.context.options.config,
          coverageFinalizeManifest: this.coverageManifestPath,
        }),
      });
      const finalizerExitCode = await handle.completion;
      if (finalizerExitCode === 0) return undefined;
    } catch (error) {
      this.services.warn(
        `[Meteor Rstest] Coverage finalization failed: ${error.message}`
      );
    }
    return exitCode === 0 ? { exitCode: 1 } : undefined;
  }

  completeRun(context) {
    if (!this.completionPromise) {
      this.completionPromise = this._completeCoverageRun(context);
    }
    return this.completionPromise;
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    let firstError;
    for (const resource of [...this.resources].reverse()) {
      try {
        await resource.stop();
      } catch (error) {
        firstError ||= error;
      }
    }
    this.resources.length = 0;
    if (firstError) throw firstError;
  }
}

module.exports = {
  collectLocalPackageTransforms,
  getPackageHarnessDevDependencies,
  resolveRstestCoverageInstrumentation,
  RstestTestRunnerProvider,
  writePrivateJsonAtomic,
};
