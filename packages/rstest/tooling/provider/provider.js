const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
  ['coverage', '--coverage'],
  ['updateSnapshots', '--update-snapshots'],
  ['shard', '--shard'],
  ['changed', '--changed'],
  ['changedSince', '--changed-since'],
];

function removeIfPresent(filename) {
  try {
    fs.unlinkSync(filename);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function selectedCount(inventory) {
  return inventory.pureFiles.length +
    inventory.runtimeFiles.length +
    inventory.externalFiles.length;
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

class RstestTestRunnerProvider {
  constructor(context, services = {}) {
    this.context = context;
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
      this.selection = {
        capability: { hasRstestConfig: false },
        inventory: {
          pureFiles: [],
          runtimeFiles: ['package-tests'],
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
    if (command === 'test-packages') await npm.ensureHarnessManifest();
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
    const token = crypto.randomBytes(24).toString('base64url');
    this.runtimeSettingsPath = worker
      ? this.workerPayload.runtimeSettingsPath
      : selection.needsRuntime
        ? path.join(runtimeDir, command === 'test-packages'
          ? 'package-runtime-plan.json'
          : 'app-runtime-settings.json')
        : null;
    this.runtimeSettingsGeneration = worker
      ? this.workerPayload.generation
      : selection.needsRuntime
        ? crypto.randomBytes(16).toString('hex')
        : null;
    if (!worker && this.runtimeSettingsPath) {
      removeIfPresent(this.runtimeSettingsPath);
    }

    this.runtimeManifest = worker ? this.workerPayload.runtimeManifest : null;
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
    this.runtimePlanArgs = command === 'test' && selection.needsRuntime &&
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
    const runtimeClient = worker
      ? false
      : this.classification
        ? this.classification.runtimeClientFiles.length > 0
        : selection.inventory.runtimeFiles.some(file =>
          /[\\/]runtime[\\/]client[\\/]/.test(file)
        );
    const runtimeServer = worker
      ? this.workerPayload.runtimeFiles.length > 0
      : this.classification
        ? this.classification.runtimeServerFiles.length > 0
        : selection.inventory.runtimeFiles.some(file =>
          /[\\/]runtime[\\/]server[\\/]/.test(file)
        );
    const client = !options.serverOnly && hasDesktopBrowser && (
      command === 'test-packages' || selection.needsRuntime && runtimeClient
    );
    const server = !options.clientOnly && (
      command === 'test-packages' || selection.needsRuntime && runtimeServer
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
      generation: this.generation,
      watch: !options.once,
      verbose,
      reportVerbose,
      testNamePattern: options.testNamePattern || null,
      testTimeout: 30000,
      hookTimeout: 10000,
      maxConcurrency: 5,
      token,
      server,
      client,
      runtime: selection.needsRuntime,
      external: selection.needsExternal,
      runtimeManifest: this.runtimeManifest,
      worker: worker ? {
        id: worker.id,
        index: worker.index,
        total: worker.total,
        generation: this.workerPayload.generation,
        resultPath: this.workerPayload.resultPath,
      } : null,
    };
    this.workerHostPlan = null;
    if (!worker && options.runtimeWorkers > 1 && selection.needsRuntime) {
      this.workerHostPlan = this.services.createRstestHostDescriptors({
        appDir,
        localDir,
        files: selection.inventory.runtimeFiles,
        requestedWorkers: options.runtimeWorkers,
        generation: this.runtimeSettingsGeneration,
        runtimeSettingsPath: this.runtimeSettingsPath,
      });
      if (this.workerHostPlan.actualWorkers < options.runtimeWorkers) {
        this.services.warn(
          `[Meteor Rstest] --runtime-workers capped from ${options.runtimeWorkers} ` +
          `to ${this.workerHostPlan.actualWorkers} selected runtime file(s).`
        );
      }
    }
    const dependencyOnly = command === 'test-packages' ||
      !selection.needsRuntime && !selection.needsExternal;
    const buildClient = client || selection.needsExternal && !options.serverOnly;
    const buildServer = server || selection.needsExternal && !options.clientOnly;
    const mode = this.workerHostPlan
        ? 'native-only'
        : selection.needsRuntime || selection.needsExternal
        ? 'meteor-host'
        : 'native-only';
    this.plan = {
      mode,
      ...(mode === 'meteor-host' && { driverPackage: 'rstest' }),
      metadata: this.metadata,
      buildPluginOptions: {
        rspack: {
          autoInstall: npm.autoInstall,
          lifecycle: dependencyOnly ? 'dependencies-only' : 'runtime',
          ...(!dependencyOnly && {
            targets: { client: buildClient, server: buildServer },
          }),
          context: {
            runtime: selection.needsRuntime,
            external: selection.needsExternal,
            server,
            client,
            runtimeManifest: this.runtimeManifest,
            npmRoot: npm.root,
          },
        },
      },
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
    this.metadata.testTimeout = settings.testTimeout;
    this.metadata.hookTimeout = settings.hookTimeout;
    this.metadata.maxConcurrency = settings.maxConcurrency;
    updateMetadata(this.metadata);
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

      const workers = this.context.meteorHosts.start(
        this.workerHostPlan.descriptors
      );
      this.resources.push(workers);
      return {
        process: {
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
        },
      };
    }

    if (selection.shouldRunNative) {
      const handle = this.services.startRstestProcess({
        appDir,
        args: this.nativeArgs,
      });
      if (options.once) {
        const code = await handle.completion;
        if (code === 0 && selection.needsRuntime) {
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

    if (selection.needsRuntime) {
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
    if (this.metadata.client) {
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
      const external = new this.services.External({
        appDir: this.context.appDir,
        url,
        args: this.externalArgs,
        resultPath: this.externalResultPath,
        token: this.metadata.token,
        generation: this.generation,
      });
      this.resources.push(external);
      await external.start();
    }
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

module.exports = { RstestTestRunnerProvider };
