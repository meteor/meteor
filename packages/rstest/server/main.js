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
export const __registerTestFile = api.registerTestFile;

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
        rstestTestNamePattern: payload.testNamePattern,
        rstestTestTimeout: payload.testTimeout,
        rstestHookTimeout: payload.hookTimeout,
        rstestToken: payload.token,
        rstestServer: payload.server,
        rstestClient: payload.client,
        rstestRuntime: payload.runtime,
        rstestExternal: payload.external,
        rstestWatch: payload.watch,
        rstestReportVerbose: payload.reportVerbose ?? payload.verbose,
        rstestWorker: payload.worker,
      };
    }
    return metadata;
  } catch {
    return {};
  }
}

async function executeTests() {
  const metadata = testMetadata();
  const generation = Number(metadata.rstestGeneration || 1);
  const results = [];
  const runtimeResults = [];

  if (metadata.rstestServer !== false) {
    const serverResult = await api.registry.run({
      testNamePattern: metadata.rstestTestNamePattern,
      testTimeout: Number(metadata.rstestTestTimeout || 30000),
      hookTimeout: Number(metadata.rstestHookTimeout || 10000),
    });
    const entry = { architecture: 'server', result: serverResult };
    results.push(entry);
    runtimeResults.push(entry);
  }

  if (metadata.rstestClient) {
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
      externalResult = await externalResultGate.wait();
    } catch (error) {
      externalResult = timeoutResult(error, 'External Rstest project result');
    }
    results.push({ architecture: 'external', result: externalResult });
  }

  const result = mergeArchitectureResults(results);

  if (metadata.rstestWorker) {
    writeWorkerResult({ worker: metadata.rstestWorker, result });
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

export function start() {
  if (!isRstestActive) return;
  Meteor.defer(() => {
    executeTests().catch(error => {
      console.error(error && error.stack || error);
      process.exit(1);
    });
  });
}

start();
