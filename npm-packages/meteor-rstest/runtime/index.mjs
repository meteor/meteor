import {
  createBrowserTaskContext,
  createRstestRuntime,
  setRealTimers,
} from '@rstest/core/internal/browser-runtime';

export const SUPPORTED_RSTEST_VERSION = '0.11.6';

function createMemorySnapshotEnvironment() {
  const snapshots = new Map();

  return {
    getVersion: () => '1',
    getHeader: () => '// Rstest Snapshot v1',
    resolvePath: async filepath => `${filepath}.snap`,
    resolveRawPath: async (_testPath, rawPath) => rawPath,
    saveSnapshotFile: async (filepath, snapshot) => {
      snapshots.set(filepath, snapshot);
    },
    readSnapshotFile: async filepath => snapshots.get(filepath) ?? null,
    removeSnapshotFile: async filepath => {
      snapshots.delete(filepath);
    },
  };
}

function createRuntimeConfig(options) {
  return {
    testTimeout: options.testTimeout,
    testNamePattern: options.testNamePattern,
    globals: false,
    passWithNoTests: true,
    retry: options.retry,
    clearMocks: false,
    resetMocks: false,
    restoreMocks: false,
    unstubEnvs: false,
    unstubGlobals: false,
    maxConcurrency: options.maxConcurrency,
    printConsoleTrace: false,
    disableConsoleIntercept: true,
    testEnvironment: { name: 'node', options: {} },
    federation: false,
    isolate: true,
    hookTimeout: options.hookTimeout,
    coverage: { enabled: false },
    snapshotFormat: {},
    expect: { poll: { interval: 50, timeout: options.testTimeout } },
    env: {},
    logHeapUsage: false,
    detectAsyncLeaks: false,
    bail: 0,
    chaiConfig: {},
    includeTaskLocation: false,
    silent: false,
  };
}

function assertOptions(options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Meteor Rstest runtime options must be an object');
  }
  for (const key of ['rootPath', 'projectRoot', 'project', 'testPath']) {
    if (typeof options[key] !== 'string' || options[key].length === 0) {
      throw new TypeError(`Meteor Rstest runtime option ${key} must be a non-empty string`);
    }
  }
  for (const key of [
    'testTimeout',
    'hookTimeout',
    'maxConcurrency',
    'retry',
    'generation',
  ]) {
    if (!Number.isInteger(options[key]) || options[key] < 0) {
      throw new TypeError(`Meteor Rstest runtime option ${key} must be a non-negative integer`);
    }
  }
  if (options.testTimeout === 0 || options.hookTimeout === 0 || options.maxConcurrency === 0) {
    throw new TypeError('Meteor Rstest runtime timeouts and concurrency must be positive');
  }
}

export async function createMeteorRstestFileRuntime(options) {
  assertOptions(options);
  setRealTimers();
  const hadPreviousApi = Object.prototype.hasOwnProperty.call(
    globalThis,
    'RSTEST_API',
  );
  const previousApi = globalThis.RSTEST_API;
  const snapshotEnvironment = createMemorySnapshotEnvironment();
  const workerState = {
    rootPath: options.rootPath,
    projectRoot: options.projectRoot,
    project: options.project,
    runtimeConfig: createRuntimeConfig(options),
    taskId: 0,
    buildId: options.generation,
    outputModule: false,
    environment: 'node',
    testPath: options.testPath,
    distPath: options.testPath,
    snapshotOptions: {
      updateSnapshot: 'none',
      snapshotEnvironment,
      snapshotFormat: {},
    },
  };
  const { api, runner } = await createRstestRuntime(workerState, {
    taskContext: createBrowserTaskContext(),
  });
  let collected = false;
  let disposed = false;

  return {
    async collectAndRun(load) {
      if (disposed) {
        throw new Error('Meteor Rstest file runtime is disposed');
      }
      if (collected) {
        throw new Error('Meteor Rstest file runtime can collect only once');
      }
      if (typeof load !== 'function') {
        throw new TypeError('Meteor Rstest test loader must be a function');
      }
      collected = true;
      await load();

      let failedTests = 0;
      return runner.runTests(
        options.testPath,
        {
          getCountOfFailedTests: async () => failedTests,
          onTestCaseResult: async result => {
            if (result.status === 'fail') {
              failedTests += 1;
            }
          },
        },
        api,
      );
    },

    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;

      let cleanupError;
      for (const cleanup of [
        () => api.rs.useRealTimers(),
        () => api.rs.restoreAllMocks(),
        () => api.rs.unstubAllEnvs(),
        () => api.rs.unstubAllGlobals(),
      ]) {
        try {
          await cleanup();
        } catch (error) {
          cleanupError ||= error;
        }
      }

      if (globalThis.RSTEST_API === api) {
        if (hadPreviousApi) {
          globalThis.RSTEST_API = previousApi;
        } else {
          delete globalThis.RSTEST_API;
        }
      }
      if (cleanupError) {
        throw cleanupError;
      }
    },
  };
}
