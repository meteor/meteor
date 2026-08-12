import { Meteor } from 'meteor/meteor';

const api = require('../runtime/singleton.js');

export const afterAll = api.afterAll;
export const afterEach = api.afterEach;
export const beforeAll = api.beforeAll;
export const beforeEach = api.beforeEach;
export const describe = api.describe;
export const expect = api.expect;
export const test = api.test;
export const __registerTestFile = api.registerTestFile;

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
  const result = await api.registry.run({
    testNamePattern: metadata.testNamePattern,
    testTimeout: metadata.testTimeout,
    hookTimeout: metadata.hookTimeout,
    maxConcurrency: metadata.maxConcurrency,
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
