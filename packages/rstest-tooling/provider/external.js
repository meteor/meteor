const {
  startRstestProcess,
} = require('./process.js');
const fs = require('node:fs');

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
  }) {
    this.appDir = appDir;
    this.url = url;
    this.args = args;
    this.startProcess = startProcess;
    this.fetch = fetch;
    this.token = token;
    this.generation = generation;
    this.resultPath = resultPath;
    this.handle = null;
  }

  async start() {
    if (this.handle) throw new Error('[Meteor Rstest] External runner is already active.');
    const env = {
      ...process.env,
      METEOR_RSTEST_BASE_URL: this.url,
    };
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
    const baseUrl = new URL(this.url);
    baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/`;
    const endpoint = new URL('__meteor__/rstest/external', baseUrl).href;
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

  async stop() {
    if (!this.handle) return;
    await this.handle.stop();
    this.handle = null;
  }
}

module.exports = { RstestExternal, structuredResultFromReport };
