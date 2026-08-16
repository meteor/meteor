import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';

const api = require('../runtime/singleton.js');
const {
  createResultGate,
  mergeArchitectureResults,
  validateResult,
} = require('../runtime/coordinator.js');
const {
  formatResultFrame,
  formatRuntimeReport,
  shouldEmitResultFrames,
} = require('../runtime/reporter.js');
const { writeWorkerResult } = require('./worker-result.js');
const {
  cloneCoverageMap,
  createServerCoverageLifecycle,
} = require('./coverage.js');
const {
  createUpstreamServerExecution,
  executeUpstreamServerTests,
} = require('./upstream-runtime.js');
const {
  createLazyRuntimeFactory,
} = require('../runtime/upstream-runtime.js');
const {
  createMeteorSnapshotEnvironment,
} = require('./snapshot-environment.js');

const clientResultGate = createResultGate({ timeoutMs: 600000 });
const externalResultGate = createResultGate({ timeoutMs: 600000 });
const activeMetadata = testMetadata();
const isRstestActive = activeMetadata.testRunner === 'rstest' &&
  (!activeMetadata.driverPackage || activeMetadata.driverPackage === 'rstest');
const runtimeSnapshotEnvironment = isRstestActive && activeMetadata.rstestAppRoot
  ? createMeteorSnapshotEnvironment({ appRoot: activeMetadata.rstestAppRoot })
  : null;
const coverageLifecycle = isRstestActive
  ? createServerCoverageLifecycle({
    coverage: activeMetadata.rstestCoverage,
    expectsClient: activeMetadata.rstestCoverageClient,
    expectsExternal: activeMetadata.rstestExternal,
    worker: activeMetadata.rstestWorker,
  })
  : null;

function timeoutResult(error, name) {
  return {
    ok: false,
    stats: { total: 1, passed: 0, failed: 1, skipped: 0, todo: 0 },
    cases: [{
      name,
      fullName: name,
      status: 'fail',
      duration: 0,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    }],
  };
}

if (isRstestActive) Meteor.methods({
  'rstest/getMetadata'() {
    const metadata = testMetadata();
    return {
      protocolVersion: 1,
      appRoot: metadata.rstestAppRoot || '/',
      generation: Number(metadata.rstestGeneration || 1),
      upstreamRuntime: Boolean(metadata.rstestUpstreamRuntime),
      testNamePattern: metadata.rstestTestNamePattern || null,
      updateSnapshot: metadata.rstestUpdateSnapshot || 'none',
      testTimeout: Number(metadata.rstestTestTimeout || 30000),
      hookTimeout: Number(metadata.rstestHookTimeout || 10000),
      maxConcurrency: Number(metadata.rstestMaxConcurrency || 5),
      runtimeConfig: metadata.rstestRuntimeConfig || {},
      coverage: metadata.rstestCoverage,
    };
  },
  'rstest/submitClientResult'(payload) {
    const metadata = testMetadata();
    if (!payload || payload.protocolVersion !== 1 ||
        payload.generation !== Number(metadata.rstestGeneration || 1) ||
        payload.token !== metadata.rstestToken || !validateResult(payload.result)) {
      throw new Meteor.Error(
        'RSTEST_PROTOCOL_MISMATCH',
        '[Meteor Rstest] Invalid client result protocol payload.',
      );
    }
    if (!clientResultGate.submit(payload.result)) {
      throw new Meteor.Error('RSTEST_RESULT_REPLAY', '[Meteor Rstest] Client result already submitted.');
    }
    return { accepted: true, protocolVersion: 1 };
  },
  async 'rstest/snapshot'(payload) {
    const metadata = testMetadata();
    if (!runtimeSnapshotEnvironment || !payload ||
        payload.protocolVersion !== 1 ||
        payload.generation !== Number(metadata.rstestGeneration || 1) ||
        payload.token !== metadata.rstestToken) {
      throw new Meteor.Error(
        'RSTEST_PROTOCOL_MISMATCH',
        '[Meteor Rstest] Invalid snapshot protocol payload.',
      );
    }
    const operation = payload.operation;
    const assertString = (value, name, maxLength = 16 * 1024) => {
      if (typeof value !== 'string' || value.length === 0 ||
          value.length > maxLength) {
        throw new Meteor.Error(
          'RSTEST_SNAPSHOT_PAYLOAD',
          `[Meteor Rstest] Invalid snapshot ${name}.`,
        );
      }
      return value;
    };
    try {
      if (operation === 'resolvePath') {
        return await runtimeSnapshotEnvironment.resolvePath(
          assertString(payload.filepath, 'filepath'),
        );
      }
      if (operation === 'resolveRawPath') {
        return await runtimeSnapshotEnvironment.resolveRawPath(
          assertString(payload.testPath, 'testPath'),
          assertString(payload.rawPath, 'rawPath'),
        );
      }
      if (operation === 'read') {
        const content = await runtimeSnapshotEnvironment.readSnapshotFile(
          assertString(payload.filepath, 'filepath'),
        );
        if (content && content.length > 4 * 1024 * 1024) {
          throw new Meteor.Error(
            'RSTEST_SNAPSHOT_PAYLOAD',
            '[Meteor Rstest] Snapshot file exceeds 4 MiB.',
          );
        }
        return content;
      }
      if (operation === 'save' || operation === 'remove') {
        if (metadata.rstestUpdateSnapshot === 'none') {
          throw new Meteor.Error(
            'RSTEST_SNAPSHOT_UPDATE_DISABLED',
            '[Meteor Rstest] Snapshot updates require --update-snapshots.',
          );
        }
        const filepath = assertString(payload.filepath, 'filepath');
        if (operation === 'save') {
          await runtimeSnapshotEnvironment.saveSnapshotFile(
            filepath,
            assertString(payload.snapshot, 'contents', 4 * 1024 * 1024),
          );
        } else {
          await runtimeSnapshotEnvironment.removeSnapshotFile(filepath);
        }
        return null;
      }
      throw new Meteor.Error(
        'RSTEST_SNAPSHOT_PAYLOAD',
        '[Meteor Rstest] Unsupported snapshot operation.',
      );
    } catch (error) {
      if (error instanceof Meteor.Error) throw error;
      throw new Meteor.Error('RSTEST_SNAPSHOT_IO', error.message);
    }
  },
});

if (isRstestActive && coverageLifecycle && coverageLifecycle.handler) {
  WebApp.connectHandlers.use(
    '/__meteor__/rstest/coverage',
    coverageLifecycle.handler,
  );
}

if (isRstestActive) WebApp.connectHandlers.use('/__meteor__/rstest/external', (request, response, next) => {
  if (request.method !== 'POST') return next();
  let body = '';
  request.setEncoding('utf8');
  request.on('data', chunk => {
    body += chunk;
    if (body.length > 1024 * 1024) request.destroy();
  });
  request.on('end', () => {
    try {
      const payload = JSON.parse(body);
      const metadata = testMetadata();
      const requestToken = request.headers['x-meteor-rstest-token'];
      const requestOrigin = request.headers.origin;
      if (requestOrigin && new URL(requestOrigin).host !== request.headers.host) {
        throw new Error('Invalid external result origin.');
      }
      if (!payload || payload.protocolVersion !== 1 ||
          payload.generation !== Number(metadata.rstestGeneration || 1) ||
          requestToken !== metadata.rstestToken || !validateResult(payload.result)) {
        throw new Error('Invalid external result protocol payload.');
      }
      if (!externalResultGate.submit(payload.result)) {
        response.writeHead(409, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'External result already submitted.' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ accepted: true, protocolVersion: 1 }));
    } catch (error) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
});

export const __registerTestFileLoader = api.registerTestFileLoader;
export const __setRstestRuntimeFactory = api.setRstestRuntimeFactory;

function testMetadata() {
  try {
    const metadata = JSON.parse(process.env.TEST_METADATA || '{}');
    if (metadata.testRunner && typeof metadata.testRunner === 'object' &&
        metadata.testRunner.id === 'rstest') {
      const payload = metadata.testRunner.payload || {};
      return {
        ...metadata,
        testRunner: metadata.testRunner.id,
        rstestGeneration: payload.generation,
        rstestAppRoot: payload.appRoot,
        rstestTestNamePattern: payload.testNamePattern,
        rstestUpdateSnapshot: payload.updateSnapshot,
        rstestTestTimeout: payload.testTimeout,
        rstestHookTimeout: payload.hookTimeout,
        rstestMaxConcurrency: payload.maxConcurrency,
        rstestRuntimeConfig: payload.runtimeConfig,
        rstestToken: payload.token,
        rstestServer: payload.server,
        rstestClient: payload.client,
        rstestCoverageClient: payload.coverageClient,
        rstestRuntimeServer: payload.runtimeServer,
        rstestRuntimeClient: payload.runtimeClient,
        rstestRuntime: payload.runtime,
        rstestUpstreamRuntime: payload.upstreamRuntime,
        rstestExternal: payload.external,
        rstestWatch: payload.watch,
        rstestReportVerbose: payload.reportVerbose ?? payload.verbose,
        rstestWorker: payload.worker,
        rstestCoverage: payload.coverage,
      };
    }
    return metadata;
  } catch {
    return {};
  }
}

function serverRuntimeOptions(metadata, generation) {
  const runtimeConfig = metadata.rstestRuntimeConfig || {
    testTimeout: Number(metadata.rstestTestTimeout || 30000),
    hookTimeout: Number(metadata.rstestHookTimeout || 10000),
    maxConcurrency: Number(metadata.rstestMaxConcurrency || 5),
  };
  return {
    getLoaders: api.takeTestFileLoaders,
    // Rspack runtime bundle registers factory while Meteor package startup is
    // still settling. Resolve it only when executor collects first test file.
    createRuntime: createLazyRuntimeFactory(api.getRstestRuntimeFactory),
    snapshotEnvironment: runtimeSnapshotEnvironment,
    metadata: {
      ...runtimeConfig,
      appRoot: metadata.rstestAppRoot,
      generation,
      testNamePattern: metadata.rstestTestNamePattern,
      updateSnapshot: metadata.rstestUpdateSnapshot || 'none',
    },
  };
}

async function executeTests({ serverResult: preparedServerResult } = {}) {
  const metadata = testMetadata();
  const generation = Number(metadata.rstestGeneration || 1);
  const results = [];
  const runtimeResults = [];

  if (metadata.rstestRuntimeServer) {
    const options = serverRuntimeOptions(metadata, generation);
    const serverResult = preparedServerResult !== undefined
      ? preparedServerResult
      : await executeUpstreamServerTests(options);
    const entry = { architecture: 'server', result: serverResult };
    results.push(entry);
    runtimeResults.push(entry);
    if (coverageLifecycle && coverageLifecycle.enabled && !metadata.rstestWorker) {
      coverageLifecycle.captureServer();
    }
  } else if (coverageLifecycle && coverageLifecycle.enabled &&
      metadata.rstestServer !== false) {
    coverageLifecycle.captureServer();
  }

  if (coverageLifecycle && metadata.rstestCoverageClient) {
    await coverageLifecycle.waitForClient();
  }

  if (metadata.rstestRuntimeClient) {
    let clientResult;
    try {
      clientResult = await clientResultGate.wait();
    } catch (error) {
      clientResult = timeoutResult(error, 'Meteor client executor result');
    }
    const entry = { architecture: 'web.browser', result: clientResult };
    results.push(entry);
    runtimeResults.push(entry);
  }

  if (metadata.rstestExternal) {
    let externalResult;
    try {
      if (coverageLifecycle) await coverageLifecycle.waitForExternal();
      externalResult = await externalResultGate.wait();
    } catch (error) {
      externalResult = timeoutResult(error, 'External Rstest project result');
    }
    results.push({ architecture: 'external', result: externalResult });
  }

  const result = mergeArchitectureResults(results);

  if (metadata.rstestWorker) {
    writeWorkerResult({
      worker: metadata.rstestWorker,
      result,
      ...(metadata.rstestWorker.coveragePath && {
        coverage: cloneCoverageMap(globalThis.__coverage__),
      }),
    });
  } else {
    if (shouldEmitResultFrames()) {
      for (const entry of results) {
        console.log(formatResultFrame({
          architecture: entry.architecture,
          generation,
          result: entry.result,
        }));
      }
    }
    const report = formatRuntimeReport({
      entries: runtimeResults,
      verbose: metadata.rstestReportVerbose,
      colors: !process.env.METEOR_DISABLE_COLORS && !process.env.NO_COLOR,
    });
    if (report) console.log(report);
  }

  if (!metadata.rstestWatch) {
    const exitCode = result.ok ? 0 : 1;
    Meteor.defer(() => process.exit(exitCode));
  }
  return result;
}

let started = false;

function failRun(error) {
  console.error(error && error.stack || error);
  process.exit(1);
}

async function startUpstreamServerLifecycle() {
  // Package-test hosts can start while Rspack still compiles generated test
  // entry. Never report an empty success or exit before compile failure lands.
  await api.waitUntilRstestRuntimeReady();
  const metadata = testMetadata();
  const generation = Number(metadata.rstestGeneration || 1);
  const execution = createUpstreamServerExecution(
    serverRuntimeOptions(metadata, generation),
  );

  const collectNext = async () => {
    if (!execution.hasNext()) {
      // Client result arrives only after server finishes startup and browser
      // can connect, so cross-architecture aggregation must continue outside
      // startup hook promise chain.
      executeTests({ serverResult: execution.result() }).catch(failRun);
      return;
    }
    await execution.collectNext();
    // Test-module evaluation can register real async Meteor.startup hooks.
    // Queue test execution behind those hooks, then collect next isolated file.
    Meteor.startup(async () => {
      try {
        await execution.runNext();
        Meteor.startup(() => collectNext().catch(failRun));
      } catch (error) {
        failRun(error);
      }
    });
  };

  Meteor.startup(() => collectNext().catch(failRun));
}

export function start() {
  if (!isRstestActive || started) return;
  started = true;
  const metadata = testMetadata();
  if (metadata.rstestRuntimeServer) {
    startUpstreamServerLifecycle().catch(failRun);
    return;
  }
  // meteor/test_environment invokes driver start from its own startup hook.
  // Queue execution once more so every hook already waiting, including async
  // application and package initialization, settles before tests begin.
  Meteor.startup(() => {
    executeTests().catch(failRun);
  });
}
