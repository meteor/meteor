const fs = require('node:fs');
const path = require('node:path');

class MeteorCoverageCaptureReporter {
  constructor({ outputPath, generation }) {
    this.outputPath = outputPath;
    this.generation = generation;
    this.flushOutputStreams = false;
  }

  async onTestRunEnd({ coverage }) {
    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.outputPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify({
        schemaVersion: 1,
        generation: this.generation,
        producer: 'native',
        coverage: coverage || {},
      }), { mode: 0o600 });
      fs.renameSync(temporaryPath, this.outputPath);
      fs.chmodSync(this.outputPath, 0o600);
    } finally {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    }
  }
}

module.exports = { MeteorCoverageCaptureReporter };
