import {
  getMeteorAppDir,
  isMeteorAppBuild,
  isMeteorAppConfigModernVerbose,
  isMeteorAppDebug,
  isMeteorAppDevelopment,
  isMeteorAppNative,
  isMeteorAppNativeAndroid,
  isMeteorAppNativeIos,
  isMeteorAppProduction,
  isMeteorAppRun,
  isMeteorAppTest,
  isMeteorAppTestWatch,
  isMeteorAppUpdate,
} from './meteor.js';

function getCurrentCommand() {
  return Package?.meteor?.global?.currentCommand || {};
}

function getNativePlatform() {
  if (isMeteorAppNativeAndroid()) return 'android';
  if (isMeteorAppNativeIos()) return 'ios';
  return null;
}

export function createMeteorToolContext(overrides = {}) {
  const currentCommand = getCurrentCommand();
  const state = overrides.state || {};

  return {
    appDir: getMeteorAppDir(),
    command: currentCommand.name,
    options: currentCommand.options || {},
    mobileServerUrl: currentCommand.mobileServerUrl || null,
    provider: undefined,
    platform: getNativePlatform(),
    isRun: isMeteorAppRun(),
    isBuild: isMeteorAppBuild(),
    isTest: isMeteorAppTest(),
    isUpdate: isMeteorAppUpdate(),
    isWatch: isMeteorAppTestWatch(),
    isNative: isMeteorAppNative(),
    isDevelopment: isMeteorAppDevelopment(),
    isProduction: isMeteorAppProduction(),
    isDebug: isMeteorAppDebug(),
    isVerbose: isMeteorAppDebug() || isMeteorAppConfigModernVerbose(),
    ...overrides,
    state,
  };
}

export function step(name, run) {
  return { name, run };
}

export function when(predicate, action) {
  return {
    name: action?.name,
    async run(context) {
      if (await predicate(context)) {
        return runLifecycleAction(action, context);
      }
    },
  };
}

export function scenario(name, { when: predicate, run, steps } = {}) {
  return {
    name,
    when: predicate || (() => true),
    run: normalizeRun(name, run, steps),
  };
}

export async function runToolScenarios({ context, setup, scenarios = [] } = {}) {
  if (!context) {
    throw new Error('tool lifecycle context is required');
  }

  await runLifecycleAction(setup, context, {
    scenarioName: 'setup',
  });

  for (const currentScenario of scenarios) {
    if (await currentScenario.when(context)) {
      await runLifecycleAction(currentScenario, context, {
        scenarioName: currentScenario.name,
      });
    }
  }

  return context;
}

function normalizeRun(scenarioName, run, steps) {
  if (run) return run;

  return async context => {
    for (const currentStep of steps || []) {
      await runLifecycleAction(currentStep, context, {
        scenarioName,
        stepName: currentStep?.name,
      });
    }
  };
}

async function runLifecycleAction(action, context, {
  scenarioName,
  stepName,
} = {}) {
  if (!action) return undefined;

  const name = stepName || action.name || action.displayName;
  const run = typeof action === 'function' ? action : action.run;
  if (!run) return undefined;

  try {
    return await run(context);
  } catch (error) {
    const parts = [
      'tool lifecycle failed',
      scenarioName && `scenario: ${scenarioName}`,
      name && `step: ${name}`,
      error.message,
    ].filter(Boolean);
    const wrapped = new Error(parts.join(' | '));
    wrapped.cause = error;
    throw wrapped;
  }
}
