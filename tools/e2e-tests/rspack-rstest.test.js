import {
  cleanupTempDir,
  killMeteorProcess,
  runMeteorCommand,
  setupMeteorApp,
  waitForMeteorOutput,
} from './helpers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { linkLocalModernTools } = require('./scripts/link-modern-tools.js');

describe('Rspack + Rstest integration', () => {
  let appDir;

  beforeAll(async () => {
    appDir = (await setupMeteorApp('rspack-rstest')).tempDir;
    await linkLocalModernTools(appDir);
  }, 600_000);

  afterAll(async () => {
    await cleanupTempDir(appDir);
  });

  test('meteor test automatically runs pure and Meteor-runtime projects', async () => {
    const result = await runMeteorCommand(
      'test',
      ['--once', '--server-only', '--port', '3195'],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('pure Rstest uses Meteor-generated context');
    expect(output).toContain('pure Rstest supports inline snapshots');
    expect(output).toContain('[Meteor Rstest] server: 2 passed, 0 failed');
    expect(output).toContain('Meteor runtime project resolves Atmosphere packages');
    expect(output).not.toContain('pure client project runs with jsdom');
    expect(output).not.toContain('Browser Mode runs in real Chromium');
    expect(output).not.toContain('[Meteor Rstest] web.browser:');
  }, 600_000);

  test('meteor name filtering reaches Meteor-runtime executor', async () => {
    const result = await runMeteorCommand(
      'test',
      [
        '--once',
        '--project',
        'meteor-runtime-server',
        '--test-name-pattern',
        '^Meteor runtime project resolves Atmosphere packages$',
        '--port',
        '3200',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('[Meteor Rstest] server: 1 passed, 0 failed, 1 skipped');
    expect(output).not.toContain('Started Meteor Rstest browser');
    expect(output).not.toContain('[Meteor Rstest] web.browser:');
  }, 600_000);

  test('meteor test-file filters Meteor-runtime compilation exactly', async () => {
    const result = await runMeteorCommand(
      'test',
      [
        '--once',
        '--project',
        'meteor-runtime-server',
        '--test-file',
        'mongo.test.js',
        '--port',
        '3203',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('Meteor runtime project resolves Atmosphere packages');
    expect(output).toContain('[Meteor Rstest] server: 1 passed, 0 failed, 0 skipped');
    expect(output).not.toContain('Meteor runtime name filter leaves this sentinel unselected');
  }, 600_000);

  test('explicit empty or invalid Rstest selections fail instead of passing zero tests', async () => {
    for (const args of [
      ['--once', '--project', 'meteor-runtime-client', '--server-only', '--port', '3204'],
      ['--once', '--test-file', 'missing.test.js', '--port', '3205'],
      ['--once', '--project', 'meteor-e2e', '--port', '3206'],
      [
        '--once',
        '--project',
        'meteor-runtime-client',
        '--client-only',
        '--exclude-archs',
        'web.browser,web.browser.legacy,web.cordova',
        '--port',
        '3208',
      ],
    ]) {
      const result = await runMeteorCommand('test', args, appDir, {
        captureOutput: true,
        execaOptions: { reject: false },
      });
      const completed = await result.meteorProcess;
      const output = result.outputLines.join('\n');
      expect(completed.exitCode).not.toBe(0);
      expect(output).not.toContain('0 passed');
    }
  }, 600_000);

  test('meteor project selection can run native Browser Mode alone', async () => {
    const result = await runMeteorCommand(
      'test',
      [
        '--once',
        '--project',
        'meteor-browser',
        '--test-file',
        'tests/rstest/browser/dom.test.js',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('Browser Mode runs in real Chromium with locator and snapshot support');
    expect(output).not.toContain('=> Started MongoDB.');
  }, 600_000);

  test('meteor client-only runs jsdom, Browser Mode, and real Meteor client executor', async () => {
    const result = await runMeteorCommand(
      'test',
      ['--once', '--client-only', '--port', '3197'],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('pure client project runs with jsdom');
    expect(output).toContain('Browser Mode runs in real Chromium');
    expect(output).toContain('Meteor client executor resolves Atmosphere runtime in real browser');
    expect(output).toContain('[Meteor Rstest] web.browser: 1 passed, 0 failed');
    expect(output).not.toContain('pure Rstest uses Meteor-generated context');
    expect(output).not.toContain('[Meteor Rstest] server:');
  }, 600_000);

  test('meteor full-app runs external E2E through Rstest Playwright fixture', async () => {
    const result = await runMeteorCommand(
      'test',
      [
        '--once',
        '--full-app',
        '--project',
        'meteor-e2e',
        '--port',
        '3198',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('full-app Rstest Playwright drives Meteor-owned app lifecycle');
    expect(output).toContain('[Meteor Rstest] external: 1 passed, 0 failed');
  }, 600_000);

  test('meteor full-app keeps ordinary Rstest runtime tests in Meteor bundle', async () => {
    const result = await runMeteorCommand(
      'test',
      [
        '--once',
        '--full-app',
        '--project',
        'meteor-runtime-server',
        '--port',
        '3201',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('Meteor runtime project resolves Atmosphere packages');
    expect(output).toContain('[Meteor Rstest] server: 2 passed, 0 failed');
  }, 600_000);

  test('meteor watch rebuilds runtime tests with a new transport generation', async () => {
    const runtimeFile = path.join(
      appDir,
      'tests',
      'rstest',
      'runtime',
      'server',
      'mongo.test.js',
    );
    const original = fs.readFileSync(runtimeFile, 'utf8');
    const result = await runMeteorCommand(
      'test',
      ['--project', 'meteor-runtime-server', '--port', '3209'],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    try {
      await waitForMeteorOutput(
        result.outputLines,
        '[Meteor Rstest] server: 2 passed, 0 failed',
        { meteorProcess: result.meteorProcess, timeout: 120_000 },
      );
      const firstOutput = result.outputLines.join('\n');
      expect(firstOutput).toContain('"generation":2');

      fs.writeFileSync(runtimeFile, `${original}\n// watch generation ${Date.now()}\n`);
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const output = result.outputLines.join('\n');
        if (output.includes('"generation":3') &&
            output.split('[Meteor Rstest] server: 2 passed, 0 failed').length > 2) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const rebuiltOutput = result.outputLines.join('\n');
      expect(rebuiltOutput).toContain('"generation":3');
    } finally {
      fs.writeFileSync(runtimeFile, original);
      await killMeteorProcess(result.meteorProcess);
    }
  }, 600_000);

  test('Meteor-runtime assertion failures retain names and return nonzero', async () => {
    const failureFile = path.join(
      appDir,
      'tests',
      'rstest',
      'runtime',
      'server',
      'intentional-failure.test.js',
    );
    fs.writeFileSync(failureFile, `
      import { expect, test } from 'meteor/rstest';
      test('intentional transported runtime failure', () => {
        expect({ compiler: 'rspack' }).toEqual({ compiler: 'other' });
      });
    `);
    try {
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--project',
          'meteor-runtime-server',
          '--test-file',
          'intentional-failure.test.js',
          '--port',
          '3210',
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: { reject: false },
        }
      );
      const completed = await result.meteorProcess;
      const output = result.outputLines.join('\n');

      expect(completed.exitCode).not.toBe(0);
      expect(output).toContain('intentional transported runtime failure');
      expect(output).toContain('[Meteor Rstest] server: 0 passed, 1 failed');
    } finally {
      fs.rmSync(failureFile, { force: true });
    }
  }, 600_000);

  test('explicit driver keeps real Mocha semantics as migration escape hatch', async () => {
    const result = await runMeteorCommand(
      'test',
      [
        '--once',
        '--driver-package',
        'meteortesting:mocha',
        '--port',
        '3199',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: {
          reject: false,
          env: { TEST_CLIENT: '0', TEST_WATCH: '0' },
        },
      }
    );
    await waitForMeteorOutput(
      result.outputLines,
      'preserves callback done and Mocha this.timeout semantics',
      { meteorProcess: result.meteorProcess, timeout: 120_000 },
    );
    await killMeteorProcess(result.meteorProcess);
    const output = result.outputLines.join('\n');

    expect(output).toContain('preserves callback done and Mocha this.timeout semantics');
    expect(output).toContain('keeps unmigrated files outside tests/legacy on real Mocha');
    expect(output).toContain('2 passing');
  }, 600_000);

  test('meteor test-packages keeps server/client local-test Isobuild construction', async () => {
    const packagesPath = path.join(appDir, '.meteor', 'packages');
    fs.writeFileSync(
      packagesPath,
      fs.readFileSync(packagesPath, 'utf8').replace(/^rstest(?:@[^\n]+)?\n/m, ''),
    );
    const result = await runMeteorCommand(
      'test-packages',
      [
        '--once',
        '--port',
        '3196',
        'rstest-e2e-fixture',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('[Meteor Rstest] server: 1 passed, 0 failed');
    expect(output).toContain('[Meteor Rstest] web.browser: 2 passed, 0 failed');
    expect(output).toContain('Package.onTest keeps Isobuild and Atmosphere resolution');
    expect(output).toContain('Package.onTest client executor runs in Meteor browser');
  }, 600_000);

  test('meteor test-packages bootstraps Rstest outside any Meteor app', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-outside-'));
    try {
      const repoRoot = path.resolve(__dirname, '../..');
      const packageDir = path.join(appDir, 'packages', 'rstest-e2e-fixture');
      const result = await runMeteorCommand(
        'test-packages',
        ['--once', '--server-only', '--port', '3207', packageDir],
        outsideDir,
        {
          captureOutput: true,
          execaOptions: {
            reject: false,
            env: {
              METEOR_RSTEST_NPM_SPEC: path.join(
                repoRoot,
                'npm-packages',
                'meteor-rstest',
              ),
              METEOR_RSPACK_NPM_SPEC: path.join(
                repoRoot,
                'npm-packages',
                'meteor-rspack',
              ),
            },
          },
        }
      );
      const completed = await result.meteorProcess;
      const output = result.outputLines.join('\n');

      expect(completed.exitCode).toBe(0);
      expect(output).toContain('[Meteor Rstest] server: 1 passed, 0 failed');
      expect(output).toContain('Package.onTest keeps Isobuild and Atmosphere resolution');
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  }, 600_000);

  test('meteor test-packages rejects mixed Rstest and Tinytest ownership before build', async () => {
    const result = await runMeteorCommand(
      'test-packages',
      [
        '--once',
        '--port',
        '3202',
        'rstest-e2e-fixture',
        'tinytest-e2e-fixture',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).not.toBe(0);
    expect(output).toContain('Mixed Rstest and legacy package tests');
    expect(output).toContain('local-test:rstest-e2e-fixture');
    expect(output).toContain('local-test:tinytest-e2e-fixture');
    expect(output).not.toContain('0 passed');
  }, 600_000);
});
