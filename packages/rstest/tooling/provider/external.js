const {
  startRstestProcess,
} = require('./process.js');
const fs = require('node:fs');
const path = require('node:path');
const {
  serializeCoverageFrames,
} = require('../../runtime/coverage-protocol.js');

function endpointUrl(url, endpoint) {
  const baseUrl = new URL(url);
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/`;
  return new URL(`__meteor__/rstest/${endpoint}`, baseUrl).href;
}

async function responseMessage(response) {
  try {
    const payload = await response.json();
    if (payload && typeof payload.error === 'string') return payload.error;
  } catch {}
  return `HTTP ${response && response.status}`;
}

function structuredResultFromReport(report, code) {
  const cases = [];
  const addCase = item => {
    const error = item.errors && item.errors[0];
    cases.push({
      name: item.name || item.fullName || item.testPath || 'Rstest failure',
      fullName: item.fullName || item.name || item.testPath || 'Rstest failure',
      status: item.status,
      duration: Number(item.duration || 0),
      ...(error ? {
        error: {
          name: error.name || 'Error',
          message: error.message || String(error),
          stack: error.stack,
        },
      } : {}),
    });
  };
  for (const item of report.tests || []) addCase(item);
  for (const file of report.files || []) {
    if (file.status === 'fail' && (!file.results || file.results.length === 0)) {
      addCase({ ...file, name: file.fullName || file.testPath || 'Rstest file failure' });
    }
  }
  for (const error of report.unhandledErrors || []) {
    addCase({
      name: 'Unhandled Rstest error',
      status: 'fail',
      errors: [error],
    });
  }
  if (code !== 0 && !cases.some(item => item.status === 'fail')) {
    addCase({
      name: 'External Rstest process',
      status: 'fail',
      errors: [{ message: `Rstest exited with status ${code}` }],
    });
  }
  const stats = { total: cases.length, passed: 0, failed: 0, skipped: 0, todo: 0 };
  const fieldByStatus = { pass: 'passed', fail: 'failed', skip: 'skipped', todo: 'todo' };
  for (const item of cases) stats[fieldByStatus[item.status]] += 1;
  return { ok: code === 0 && stats.failed === 0, stats, cases };
}

class RstestExternal {
  constructor({
    appDir,
    url,
    args,
    startProcess = startRstestProcess,
    fetch = global.fetch,
    token,
    generation = 1,
    resultPath,
    coverageGeneration,
    coverageArtifactPath,
    coverageShardDirectory,
    coverageSupport,
  }) {
    this.appDir = appDir;
    this.url = url;
    this.args = args;
    this.startProcess = startProcess;
    this.fetch = fetch;
    this.token = token;
    this.generation = generation;
    this.resultPath = resultPath;
    this.coverageGeneration = coverageGeneration;
    this.coverageArtifactPath = coverageArtifactPath;
    this.coverageShardDirectory = coverageShardDirectory;
    this.coverageSupport = coverageSupport;
    this.handle = null;
  }

  async start() {
    if (this.handle) throw new Error('[Meteor Rstest] External runner is already active.');
    const env = {
      ...process.env,
      METEOR_RSTEST_BASE_URL: this.url,
    };
    for (const name of [
      'METEOR_RSTEST_COVERAGE_TOKEN',
      'METEOR_RSTEST_COVERAGE_GENERATION',
      'METEOR_RSTEST_COVERAGE_PRODUCER',
      'METEOR_RSTEST_COVERAGE_SHARD_DIR',
    ]) delete env[name];
    if (this.coverageGeneration) {
      Object.assign(env, {
        METEOR_RSTEST_COVERAGE_GENERATION: this.coverageGeneration,
        METEOR_RSTEST_COVERAGE_PRODUCER: 'e2e',
        METEOR_RSTEST_COVERAGE_SHARD_DIR: this.coverageShardDirectory,
      });
    }
    this.handle = this.startProcess({
      appDir: this.appDir,
      args: this.args,
      env,
    });

    let code;
    try {
      code = await this.handle.completion;
    } finally {
      this.handle = null;
    }

    if (this.coverageGeneration) await this._submitCoverageShards();

    let report = {};
    try {
      report = JSON.parse(fs.readFileSync(this.resultPath, 'utf8'));
    } catch (error) {
      if (code === 0) {
        throw new Error(
          `[Meteor Rstest] External Rstest result file is missing or invalid: ${error.message}`
        );
      }
    }
    const result = structuredResultFromReport(report, code);
    const endpoint = endpointUrl(this.url, 'external');
    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-meteor-rstest-token': this.token,
      },
      body: JSON.stringify({
        protocolVersion: 1,
        generation: this.generation,
        result,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `[Meteor Rstest] External result endpoint returned HTTP ${response.status}.`,
      );
    }
  }

  _coverageSupport() {
    if (this.coverageSupport) return this.coverageSupport;
    const packageJson = require.resolve('@meteorjs/rstest/package.json', {
      paths: [this.appDir],
    });
    return require(path.join(
      path.dirname(packageJson),
      'src/coverage/playwright.js',
    ));
  }

  async _submitCoverageShards() {
    if (!this.coverageShardDirectory) {
      throw new Error('[Meteor Rstest] Playwright coverage shard directory is missing.');
    }
    const support = this._coverageSupport();
    try {
      const { coverage } = support.readCoverageShards({
        directory: this.coverageShardDirectory,
        generation: this.coverageGeneration,
      });
      const endpoint = endpointUrl(this.url, 'coverage');
      const origin = new URL(endpoint).origin;
      const frames = serializeCoverageFrames({
        generation: this.coverageGeneration,
        token: this.token,
        producer: 'e2e',
        coverage,
      });
      for (const frame of frames) {
        const response = await this.fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin,
            'x-meteor-rstest-token': this.token,
          },
          body: JSON.stringify(frame),
        });
        if (!response.ok) {
          throw new Error(
            `[Meteor Rstest] External coverage endpoint rejected a ${frame.type} ` +
            `frame: ${await responseMessage(response)}.`,
          );
        }
      }
      if (this.coverageArtifactPath && !fs.existsSync(this.coverageArtifactPath)) {
        throw new Error(
          '[Meteor Rstest] External coverage commit did not create its artifact.',
        );
      }
    } finally {
      support.cleanupCoverageShardDirectory({
        directory: this.coverageShardDirectory,
        generation: this.coverageGeneration,
      });
    }
  }

  async stop() {
    if (!this.handle) return;
    await this.handle.stop();
    this.handle = null;
  }
}

module.exports = { RstestExternal, structuredResultFromReport };
