import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  cleanupTempDir,
  killMeteorProcess,
  runMeteorCommand,
  waitForMeteorOutput,
} from '../helpers';

describe('Regressions / Test-in-browser /', () => {
  const port = 3156;
  let tempDir;
  let meteorProcess;
  let testPage;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meteortest-test-in-browser-'));
    testPage = await browser.newPage();
  });

  afterEach(async () => {
    if (testPage) await testPage.close();
    await killMeteorProcess(meteorProcess);
    await cleanupTempDir(tempDir);
    meteorProcess = null;
  });

  it('runs a newly created package\'s client and server tests with the default browser driver', async () => {
    const packageName = 'browser-driver-regression';
    const browserErrors = [];
    testPage.on('pageerror', error => browserErrors.push(error.message));

    // Reproduce #14735 with the generated package as-is. Adding jquery here
    // or using test-in-console would mask a missing dependency in the driver.
    await runMeteorCommand('create', ['--package', packageName], tempDir, {
      checkExitCode: true,
      captureOutput: true,
    });

    const result = await runMeteorCommand(
      'test-packages',
      ['./', '--port', String(port), '--test-app-path', path.join(tempDir, 'test-app')],
      path.join(tempDir, packageName),
      { captureOutput: true },
    );
    meteorProcess = result.meteorProcess;

    await waitForMeteorOutput(
      result.outputLines,
      `=> App running at http://localhost:${port}/`,
      { meteorProcess },
    );

    await testPage.goto(`http://localhost:${port}/`);
    // Report startup errors directly, including "jQuery not found", instead
    // of waiting for a UI that cannot render when the driver fails to load.
    expect(browserErrors).toEqual([]);

    await testPage.waitForFunction(() => {
      const summary = document.querySelector('.navbar-brand')?.textContent.trim();
      return summary === 'All tests pass!' || summary === 'There are failures.';
    });

    const results = await testPage.evaluate(() => ({
      summary: document.querySelector('.navbar-brand').textContent.trim(),
      progress: document.querySelector('#testProgressBar .in-progress').textContent.trim(),
      tests: [...document.querySelectorAll('.testname')]
        .map(node => node.textContent.replace(/\s+/g, ' ').trim())
        .sort(),
    }));

    expect(browserErrors).toEqual([]);
    expect(results).toEqual({
      summary: 'All tests pass!',
      progress: 'Passed 2 of 2',
      tests: ['C: example', 'S: example'],
    });
  }, 300000);
});
