import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';

const api = require('../runtime/singleton.js');
const {
  createResultGate,
  mergeArchitectureResults,
  validateResult,
} = require('../runtime/coordinator.js');
const { formatResultFrame, formatSummary } = require('../runtime/reporter.js');

const clientResultGate = createResultGate({ timeoutMs: 600000 });
const externalResultGate = createResultGate({ timeoutMs: 600000 });
const activeMetadata = testMetadata();
const isRstestActive = activeMetadata.testRunner === 'rstest' &&
  (!activeMetadata.driverPackage || activeMetadata.driverPackage === 'rstest');

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
      generation: Number(metadata.rstestGeneration || 1),
      testNamePattern: metadata.rstestTestNamePattern || null,
      testTimeout: Number(metadata.rstestTestTimeout || 30000),
      hookTimeout: Number(metadata.rstestHookTimeout || 10000),
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
});

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

export const afterAll = api.afterAll;
export const afterEach = api.afterEach;
export const beforeAll = api.beforeAll;
export const beforeEach = api.beforeEach;
export const describe = api.describe;
export const expect = api.expect;
export const test = api.test;

function testMetadata() {
  try {
    return JSON.parse(process.env.TEST_METADATA || '{}');
  } catch {
    return {};
  }
}

async function executeTests() {
  const metadata = testMetadata();
  const generation = Number(metadata.rstestGeneration || 1);
  const results = [];

  if (metadata.rstestServer !== false) {
    const serverResult = await api.registry.run({
      testNamePattern: metadata.rstestTestNamePattern,
      testTimeout: Number(metadata.rstestTestTimeout || 30000),
      hookTimeout: Number(metadata.rstestHookTimeout || 10000),
    });
    results.push({ architecture: 'server', result: serverResult });
    console.log(formatResultFrame({ architecture: 'server', generation, result: serverResult }));
    console.log(formatSummary({ architecture: 'server', result: serverResult }));
  }

  if (metadata.rstestClient) {
    let clientResult;
    try {
      clientResult = await clientResultGate.wait();
    } catch (error) {
      clientResult = timeoutResult(error, 'Meteor client executor result');
    }
    results.push({ architecture: 'web.browser', result: clientResult });
    console.log(formatResultFrame({ architecture: 'web.browser', generation, result: clientResult }));
    console.log(formatSummary({ architecture: 'web.browser', result: clientResult }));
  }

  if (metadata.rstestExternal) {
    let externalResult;
    try {
      externalResult = await externalResultGate.wait();
    } catch (error) {
      externalResult = timeoutResult(error, 'External Rstest project result');
    }
    results.push({ architecture: 'external', result: externalResult });
    console.log(formatResultFrame({ architecture: 'external', generation, result: externalResult }));
    console.log(formatSummary({ architecture: 'external', result: externalResult }));
  }

  const result = mergeArchitectureResults(results);
  if (results.length > 1) {
    console.log(formatSummary({ architecture: 'all', result }));
  }

  if (!metadata.rstestWatch) {
    const exitCode = result.ok ? 0 : 1;
    Meteor.defer(() => process.exit(exitCode));
  }
  return result;
}

export function start() {
  if (!isRstestActive) return;
  Meteor.defer(() => {
    executeTests().catch(error => {
      console.error(error && error.stack || error);
      process.exit(1);
    });
  });
}
