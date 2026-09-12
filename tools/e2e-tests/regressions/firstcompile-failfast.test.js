import fs from 'fs-extra';
import path from 'path';

import {
  cleanupTempDir,
  killMeteorProcess,
  runMeteorCommand,
  setupMeteorApp,
} from '../helpers';

const { linkLocalRspack } = require('../scripts/link-rspack');

const EXIT_TIMEOUT_MS = 15_000;

function waitForProcessExit(process, timeoutMs) {
  if (process.exitCode != null || process.signalCode != null) {
    return Promise.resolve({
      code: process.exitCode,
      signal: process.signalCode,
    });
  }

  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);
    process.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

describe('Regressions / Rspack first-compilation failures /', () => {
  let tempDir;
  let meteorProcess;

  beforeAll(async () => {
    tempDir = (await setupMeteorApp('server-only'))?.tempDir;

    await runMeteorCommand('add', ['rspack'], tempDir, {
      checkExitCode: true,
    });
    await linkLocalRspack(tempDir);
  });

  afterEach(async () => {
    await killMeteorProcess(meteorProcess);
    meteorProcess = null;
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  it('fails promptly when the server Rspack process exits before compiling', async () => {
    await fs.writeFile(
      path.join(tempDir, 'rspack.config.js'),
      "throw new Error('intentional pre-compilation Rspack failure');\n"
    );

    const result = await runMeteorCommand('run', ['--port', '3124'], tempDir, {
      captureOutput: true,
    });
    meteorProcess = result.meteorProcess;
    meteorProcess.catch(() => {});

    const exit = await waitForProcessExit(meteorProcess, EXIT_TIMEOUT_MS);
    const output = result.outputLines.join('\n');

    expect(exit).not.toBeNull();
    expect(exit.code).not.toBe(0);
    expect(output).toMatch(
      /Rspack server process exited unexpectedly.*before completing its first compilation/
    );
    expect(output).toContain(
      'Review the Rspack error output above for the underlying cause.'
    );
    expect(output).not.toContain('signal null');
  });
});
