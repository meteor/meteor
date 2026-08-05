import { Meteor } from 'meteor/meteor';

const api = require('../runtime/singleton.js');
const { formatResultFrame, formatSummary } = require('../runtime/reporter.js');

export const afterAll = api.afterAll;
export const afterEach = api.afterEach;
export const beforeAll = api.beforeAll;
export const beforeEach = api.beforeEach;
export const describe = api.describe;
export const expect = api.expect;
export const test = api.test;

export async function runTests() {
  const metadata = await Meteor.callAsync('rstest/getMetadata');
  if (!metadata || metadata.protocolVersion !== 1) {
    throw new Error('[Meteor Rstest] Invalid runtime metadata protocol payload.');
  }
  const result = await api.registry.run({
    testNamePattern: metadata.testNamePattern,
    testTimeout: metadata.testTimeout,
    hookTimeout: metadata.hookTimeout,
  });
  console.log(formatResultFrame({
    architecture: 'web.browser',
    generation: metadata.generation,
    result,
  }));
  console.log(formatSummary({ architecture: 'web.browser', result }));
  await Meteor.callAsync('rstest/submitClientResult', {
    protocolVersion: 1,
    generation: metadata.generation,
    token: globalThis.__METEOR_RSTEST_TOKEN__,
    result,
  });
  return result;
}
