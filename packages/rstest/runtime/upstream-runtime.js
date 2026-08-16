const {
  normalizeUpstreamFileResults,
} = require('./upstream-result.js');

function serializeError(error) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    name: normalized.name,
    message: normalized.message,
    stack: normalized.stack,
  };
}

function failureFile(testPath, phase, error) {
  return {
    testPath,
    status: 'fail',
    results: [{
      name: `<${phase}>`,
      parentNames: [testPath],
      status: 'fail',
      testPath,
      errors: [serializeError(error)],
    }],
  };
}

function createLazyRuntimeFactory(getRuntimeFactory) {
  if (typeof getRuntimeFactory !== 'function') {
    throw new TypeError('[Meteor Rstest] Runtime factory getter must be a function.');
  }
  return (...args) => getRuntimeFactory()(...args);
}

function createUpstreamExecution({
  loaders,
  getLoaders,
  metadata,
  project,
  snapshotEnvironment,
  createRuntime,
}) {
  if (typeof createRuntime !== 'function') {
    throw new TypeError('[Meteor Rstest] Upstream runtime factory must be a function.');
  }
  if (!Array.isArray(loaders) && typeof getLoaders !== 'function') {
    throw new TypeError(
      '[Meteor Rstest] Upstream loaders must be an array or provided by a getter.',
    );
  }
  const files = [];
  let sortedLoaders;
  const resolveLoaders = () => {
    if (sortedLoaders) return sortedLoaders;
    const resolved = getLoaders ? getLoaders() : loaders;
    if (!Array.isArray(resolved)) {
      throw new TypeError('[Meteor Rstest] Upstream loader getter must return an array.');
    }
    sortedLoaders = [...resolved].sort((left, right) =>
      left.testPath.localeCompare(right.testPath)
    );
    return sortedLoaders;
  };
  let index = 0;
  let current = null;

  const dispose = async record => {
    if (!record.runtime) return;
    try {
      await record.runtime.dispose();
    } catch (error) {
      if (!record.fileResult || record.fileResult.status !== 'fail') {
        record.fileResult = failureFile(record.entry.testPath, 'dispose', error);
      } else {
        record.fileResult.results.push(...failureFile(
          record.entry.testPath,
          'dispose',
          error,
        ).results);
      }
    }
  };

  return {
    hasNext() {
      return index < resolveLoaders().length;
    },

    async collectNext() {
      const loadersForRun = resolveLoaders();
      if (current) {
        throw new Error('[Meteor Rstest] Current upstream file has not run.');
      }
      if (index >= loadersForRun.length) {
        throw new Error('[Meteor Rstest] No upstream test file remains.');
      }
      const entry = loadersForRun[index];
      const record = current = { entry, runtime: null, fileResult: null };
      try {
        record.runtime = await createRuntime({
          ...metadata,
          rootPath: metadata.appRoot,
          projectRoot: metadata.appRoot,
          project,
          testPath: entry.testPath,
          testNamePattern: metadata.testNamePattern || undefined,
          testTimeout: metadata.testTimeout,
          hookTimeout: metadata.hookTimeout,
          maxConcurrency: metadata.maxConcurrency,
          retry: metadata.retry ?? 0,
          generation: metadata.generation,
          updateSnapshot: metadata.updateSnapshot || 'none',
          ...(snapshotEnvironment ? { snapshotEnvironment } : {}),
        });
        if (!record.runtime || typeof record.runtime.collect !== 'function' ||
            typeof record.runtime.run !== 'function' ||
            typeof record.runtime.dispose !== 'function') {
          throw new TypeError(
            '[Meteor Rstest] Upstream runtime must implement collect(), run(), and dispose().'
          );
        }
        await record.runtime.collect(entry.load);
      } catch (error) {
        record.fileResult = failureFile(entry.testPath, 'module', error);
      }
    },

    async runNext() {
      if (!current) {
        throw new Error('[Meteor Rstest] Upstream test file must collect before run.');
      }
      const record = current;
      if (!record.fileResult) {
        try {
          record.fileResult = await record.runtime.run();
        } catch (error) {
          record.fileResult = failureFile(record.entry.testPath, 'run', error);
        }
      }
      await dispose(record);
      files.push(record.fileResult);
      current = null;
      index += 1;
      return record.fileResult;
    },

    result() {
      if (current || index < resolveLoaders().length) {
        throw new Error('[Meteor Rstest] Upstream execution is not complete.');
      }
      return normalizeUpstreamFileResults(files);
    },
  };
}

async function executeUpstreamTests(options) {
  const execution = createUpstreamExecution(options);
  while (execution.hasNext()) {
    await execution.collectNext();
    await execution.runNext();
  }
  return execution.result();
}

module.exports = {
  createLazyRuntimeFactory,
  createUpstreamExecution,
  executeUpstreamTests,
};
