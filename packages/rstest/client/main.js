import { Meteor } from 'meteor/meteor';

const api = require('../runtime/singleton.js');
const { executeUpstreamTests } = require('../runtime/upstream-runtime.js');
const {
  createMeteorClientSnapshotEnvironment,
} = require('./snapshot-environment.js');

export const __registerTestFileLoader = api.registerTestFileLoader;
export const __setRstestRuntimeFactory = api.setRstestRuntimeFactory;

let runPromise;

export function runTests() {
  if (runPromise) return runPromise;
  runPromise = executeTests();
  return runPromise;
}

async function executeTests() {
  const metadata = await Meteor.callAsync('rstest/getMetadata');
  if (!metadata || metadata.protocolVersion !== 1) {
    throw new Error('[Meteor Rstest] Invalid runtime metadata protocol payload.');
  }
  await api.waitUntilRstestRuntimeReady();
  const runtimeOptions = {
    ...(metadata.runtimeConfig || {}),
    testNamePattern: metadata.testNamePattern,
    updateSnapshot: metadata.updateSnapshot || 'none',
    testTimeout: metadata.runtimeConfig?.testTimeout ?? metadata.testTimeout,
    hookTimeout: metadata.runtimeConfig?.hookTimeout ?? metadata.hookTimeout,
    maxConcurrency: metadata.runtimeConfig?.maxConcurrency ?? metadata.maxConcurrency,
  };
  const result = await executeUpstreamTests({
    loaders: api.takeTestFileLoaders(),
    createRuntime: api.getRstestRuntimeFactory(),
    project: 'meteor-runtime-client',
    snapshotEnvironment: createMeteorClientSnapshotEnvironment({
      callAsync: Meteor.callAsync.bind(Meteor),
      generation: metadata.generation,
      token: globalThis.__METEOR_RSTEST_TOKEN__,
    }),
    metadata: {
      appRoot: metadata.appRoot,
      generation: metadata.generation,
      ...runtimeOptions,
    },
  });
  await Meteor.callAsync('rstest/submitClientResult', {
    protocolVersion: 1,
    generation: metadata.generation,
    token: globalThis.__METEOR_RSTEST_TOKEN__,
    result,
  });
  return result;
}

let started = false;

export function start() {
  if (started) return;
  started = true;
  Meteor.startup(() => {
    runTests().catch(error => {
      console.error(error && error.stack || error);
    });
  });
}
