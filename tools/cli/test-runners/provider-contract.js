const {
  cloneJsonSafe,
} = require('../../tool-env/test-runner-context.js');

const VALID_PLAN_MODES = new Set(['native-only', 'meteor-host']);

function contractError(message) {
  const error = new Error(message);
  error.code = 'METEOR_TEST_RUNNER_INVALID_PROVIDER';
  return error;
}

function createTestRunnerContext(input) {
  return cloneJsonSafe(input, 'test runner context');
}

function normalizeTestRunnerVerbose(meteorConfig = {}, commandVerbose = false) {
  return Boolean(
    commandVerbose || meteorConfig.verbose ||
    meteorConfig.modern && meteorConfig.modern.verbose ||
    meteorConfig.modern && meteorConfig.modern.transpiler &&
      meteorConfig.modern.transpiler.verbose
  );
}

function validateRecord(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contractError(`${path} must be an object`);
  }
  return cloneJsonSafe(value, path);
}

function validateTestExecutionPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw contractError('test execution plan must be an object');
  }
  if (!VALID_PLAN_MODES.has(plan.mode)) {
    throw contractError(
      'test execution plan mode must be "native-only" or "meteor-host"'
    );
  }

  const normalized = { mode: plan.mode };
  if (plan.metadata !== undefined) {
    normalized.metadata = validateRecord(plan.metadata, 'metadata');
  }
  if (plan.buildPluginOptions !== undefined) {
    const options = validateRecord(
      plan.buildPluginOptions,
      'buildPluginOptions'
    );
    for (const [packageName, value] of Object.entries(options)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw contractError(
          `buildPluginOptions.${packageName} must be an object`
        );
      }
    }
    normalized.buildPluginOptions = options;
  }
  return Object.freeze(normalized);
}

function validatePreHostResult(result) {
  if (result === undefined) {
    return undefined;
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw contractError('startBeforeHost result must be an object');
  }
  if (result.exitCode !== undefined &&
      (!Number.isInteger(result.exitCode) || result.exitCode < 0)) {
    throw contractError('startBeforeHost exitCode must be a non-negative integer');
  }
  if (result.process !== undefined) {
    if (!result.process || typeof result.process !== 'object') {
      throw contractError('startBeforeHost process must be an object');
    }
    if (!result.process.completion ||
        typeof result.process.completion.then !== 'function') {
      throw contractError('startBeforeHost process.completion must be a Promise');
    }
    if (typeof result.process.stop !== 'function') {
      throw contractError('startBeforeHost process.stop must be a function');
    }
  }
  return Object.freeze({ ...result });
}

function createProviderSession({ registration, provider, context }) {
  for (const method of ['validate', 'prepare']) {
    if (!provider || typeof provider[method] !== 'function') {
      throw contractError(
        `test runner provider "${registration.id}" must implement ${method}()`
      );
    }
  }

  let stopped = false;
  let planPromise = null;
  const stop = async () => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (typeof provider.stop === 'function') {
      await provider.stop();
    }
  };
  const stopAfterFailure = async error => {
    try {
      await stop();
    } catch (cleanupError) {
      if (error && (typeof error === 'object' || typeof error === 'function')) {
        try {
          error.cleanupError = cleanupError;
        } catch {}
      }
    }
    throw error;
  };

  const session = {
    registration,
    context,

    async prepare() {
      if (!planPromise) {
        planPromise = (async () => {
          try {
            await provider.validate(context);
            return validateTestExecutionPlan(await provider.prepare(context));
          } catch (error) {
            return stopAfterFailure(error);
          }
        })();
      }
      return planPromise;
    },

    async startBeforeHost(executionContext) {
      if (typeof provider.startBeforeHost !== 'function') {
        return undefined;
      }
      try {
        return validatePreHostResult(
          await provider.startBeforeHost(executionContext)
        );
      } catch (error) {
        return stopAfterFailure(error);
      }
    },

    async beforeAppRun(appGenerationContext) {
      if (typeof provider.beforeAppRun === 'function') {
        try {
          return await provider.beforeAppRun(appGenerationContext);
        } catch (error) {
          return stopAfterFailure(error);
        }
      }
    },

    async startHost(hostContext) {
      if (typeof provider.startHost === 'function') {
        try {
          return await provider.startHost(hostContext);
        } catch (error) {
          return stopAfterFailure(error);
        }
      }
    },

    stop,
  };

  return Object.freeze(session);
}

module.exports = {
  createProviderSession,
  createTestRunnerContext,
  normalizeTestRunnerVerbose,
  validateTestExecutionPlan,
};
