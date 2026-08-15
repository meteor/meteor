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

async function executeUpstreamServerTests({
  loaders,
  metadata,
  createRuntime,
}) {
  if (typeof createRuntime !== 'function') {
    throw new TypeError('[Meteor Rstest] Upstream runtime factory must be a function.');
  }
  const files = [];
  const sortedLoaders = [...loaders].sort((left, right) =>
    left.testPath.localeCompare(right.testPath)
  );

  for (const entry of sortedLoaders) {
    let runtime;
    let fileResult;
    try {
      runtime = await createRuntime({
        rootPath: metadata.appRoot,
        projectRoot: metadata.appRoot,
        project: 'meteor-runtime-server',
        testPath: entry.testPath,
        testNamePattern: metadata.testNamePattern || undefined,
        testTimeout: metadata.testTimeout,
        hookTimeout: metadata.hookTimeout,
        maxConcurrency: metadata.maxConcurrency,
        retry: 0,
        generation: metadata.generation,
      });
      fileResult = await runtime.collectAndRun(entry.load);
    } catch (error) {
      fileResult = failureFile(entry.testPath, 'module', error);
    } finally {
      if (runtime) {
        try {
          await runtime.dispose();
        } catch (error) {
          if (!fileResult || fileResult.status !== 'fail') {
            fileResult = failureFile(entry.testPath, 'dispose', error);
          } else {
            fileResult.results.push(...failureFile(
              entry.testPath,
              'dispose',
              error,
            ).results);
          }
        }
      }
    }
    files.push(fileResult);
  }

  return normalizeUpstreamFileResults(files);
}

module.exports = {
  executeUpstreamServerTests,
};
