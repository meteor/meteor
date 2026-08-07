import {
  cleanupTempDir,
  killMeteorProcess,
  runMeteorCommand,
  setupMeteorApp,
  waitForMeteorOutput,
} from './helpers';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const { linkLocalModernTools } = require('./scripts/link-modern-tools.js');

async function reservePortBlock(size) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 20_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let offset = 0; offset < size; offset += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(base + offset, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      return base;
    } catch {
      // Try another contiguous range after releasing this partial reservation.
    } finally {
      await Promise.all(servers.map(server =>
        new Promise(resolve => server.close(resolve))
      ));
    }
  }
  throw new Error('Unable to reserve ports for Rspack + Rstest E2E tests.');
}

describe('Rspack + Rstest integration', () => {
  let appDir;
  let portBase;
  const testPort = oldPort => String(portBase + (Number(oldPort) - 3195) * 2);

  beforeAll(async () => {
    portBase = await reservePortBlock(33);
    appDir = (await setupMeteorApp('rspack-rstest')).tempDir;
    await linkLocalModernTools(appDir);
  }, 600_000);

  afterAll(async () => {
    await cleanupTempDir(appDir);
  });

  test('meteor test automatically runs pure and Meteor-runtime projects', async () => {
    const result = await runMeteorCommand(
      'test',
      ['--once', '--server-only', '--port', testPort(3195)],
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

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')
    );
    expect(packageJson.dependencies['@meteorjs/rspack']).toMatch(/^file:/);
    expect(packageJson.devDependencies['@meteorjs/rstest']).toMatch(/^file:/);
    expect(packageJson.devDependencies['@rstest/core']).toBe('0.11.6');
    expect(packageJson.devDependencies['@rstest/adapter-rspack']).toBe('0.11.6');
    expect(packageJson.devDependencies['@rstest/coverage-istanbul']).toBe('0.11.6');
  }, 600_000);

  test('meteor update-snapshots repairs a native Rstest mismatch', async () => {
    const testFile = path.join(
      appDir,
      'tests',
      'rstest',
      'pure',
      'server',
      'math.test.js',
    );
    const snapshotFile = path.join(
      path.dirname(testFile),
      '__snapshots__',
      'math.test.js.snap',
    );
    const originalTest = fs.readFileSync(testFile, 'utf8');
    const originalSnapshot = fs.readFileSync(snapshotFile, 'utf8');
    const changedTest = originalTest.replace(
      '@rspack/core@2.1.8',
      '@rspack/core@2.1.8-updated',
    );
    expect(changedTest).not.toBe(originalTest);
    fs.writeFileSync(testFile, changedTest);

    const args = [
      '--once',
      '--server-only',
      '--project',
      'meteor-pure-server',
      '--test-file',
      'tests/rstest/pure/server/math.test.js',
    ];
    const runSnapshotCommand = async extraArgs => {
      const result = await runMeteorCommand(
        'test',
        [...args, ...extraArgs],
        appDir,
        {
          captureOutput: true,
          execaOptions: { reject: false },
        },
      );
      return {
        completed: await result.meteorProcess,
        output: result.outputLines.join('\n'),
      };
    };

    try {
      const mismatch = await runSnapshotCommand([]);
      expect(mismatch.completed.exitCode).not.toBe(0);
      expect(mismatch.output).toContain('tests/rstest/pure/server/math.test.js');
      expect(fs.readFileSync(snapshotFile, 'utf8')).toBe(originalSnapshot);

      const update = await runSnapshotCommand(['--update-snapshots']);
      expect(update.completed.exitCode).toBe(0);
      const updatedSnapshot = fs.readFileSync(snapshotFile, 'utf8');
      expect(updatedSnapshot).not.toBe(originalSnapshot);
      expect(updatedSnapshot).toContain('@rspack/core@2.1.8-updated');

      const verified = await runSnapshotCommand([]);
      expect(verified.completed.exitCode).toBe(0);
    } finally {
      fs.writeFileSync(testFile, originalTest);
      fs.writeFileSync(snapshotFile, originalSnapshot);
    }
  }, 600_000);

  test('meteor coverage writes an Istanbul report for native Rspack source', async () => {
    const coverageDir = path.join(
      appDir,
      '.meteor',
      'local',
      'rstest',
      'e2e-coverage',
    );
    try {
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--server-only',
          '--project',
          'meteor-pure-server',
          '--test-file',
          'tests/rstest/pure/server/math.test.js',
          '--coverage',
          '--',
          '--coverage.reporters',
          'json',
          '--coverage.reportsDirectory',
          coverageDir,
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: { reject: false },
        },
      );
      const completed = await result.meteorProcess;
      const reportFile = path.join(coverageDir, 'coverage-final.json');

      expect(completed.exitCode).toBe(0);
      expect(fs.existsSync(reportFile)).toBe(true);
      const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
      const target = Object.entries(report).find(([file]) =>
        file.replaceAll('\\', '/').endsWith(
          '/tests/rstest/pure/server/coverage-target.js'
        )
      );
      expect(target).toBeDefined();
      expect(Object.values(target[1].s).some(count => count > 0)).toBe(true);
      expect(Object.values(target[1].f).some(count => count > 0)).toBe(true);
    } finally {
      fs.rmSync(coverageDir, { recursive: true, force: true });
    }
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
        testPort(3200),
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
        testPort(3203),
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
      ['--once', '--project', 'meteor-runtime-client', '--server-only', '--port', testPort(3204)],
      ['--once', '--test-file', 'missing.test.js', '--port', testPort(3205)],
      ['--once', '--project', 'meteor-e2e', '--port', testPort(3206)],
      [
        '--once',
        '--project',
        'meteor-runtime-client',
        '--client-only',
        '--exclude-archs',
        'web.browser,web.browser.legacy,web.cordova',
        '--port',
        testPort(3208),
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
    expect(output).toContain('tests/rstest/browser/dom.test.js');
    expect(output).not.toContain('=> Started MongoDB.');
  }, 600_000);

  test('meteor client-only runs jsdom, Browser Mode, and real Meteor client executor', async () => {
    const result = await runMeteorCommand(
      'test',
      ['--once', '--client-only', '--port', testPort(3197)],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('tests/rstest/pure/client/dom.test.js');
    expect(output).toContain('tests/rstest/browser/dom.test.js');
    expect(output).toContain('Meteor client executor resolves Atmosphere runtime in real browser');
    expect(output).toContain('[Meteor Rstest] web.browser: 1 passed, 0 failed');
    expect(output).not.toContain('tests/rstest/pure/server/math.test.js');
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
        testPort(3198),
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
        testPort(3201),
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
      ['--project', 'meteor-runtime-server', '--port', testPort(3209)],
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
      const firstGenerations = [...firstOutput.matchAll(/"generation":(\d+)/g)]
        .map(match => Number(match[1]));
      const firstGeneration = Math.max(...firstGenerations);
      expect(firstGeneration).toBeGreaterThanOrEqual(1);

      await waitForMeteorOutput(
        result.outputLines,
        '=> App running at',
        { meteorProcess: result.meteorProcess, timeout: 30_000 },
      );

      const watchedSource = original.replace(
        'Meteor runtime project resolves Atmosphere packages',
        `Meteor runtime project resolves Atmosphere packages ${Date.now()}`,
      );
      expect(watchedSource).not.toBe(original);
      fs.writeFileSync(runtimeFile, watchedSource);
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const output = result.outputLines.join('\n');
        const generations = [...output.matchAll(/"generation":(\d+)/g)]
          .map(match => Number(match[1]));
        if (generations.some(generation => generation > firstGeneration) &&
            output.split('[Meteor Rstest] server: 2 passed, 0 failed').length > 2) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const rebuiltOutput = result.outputLines.join('\n');
      const rebuiltGenerations = [...rebuiltOutput.matchAll(/"generation":(\d+)/g)]
        .map(match => Number(match[1]));
      expect(Math.max(...rebuiltGenerations)).toBeGreaterThan(firstGeneration);
    } finally {
      await killMeteorProcess(result.meteorProcess);
      fs.writeFileSync(runtimeFile, original);
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
          testPort(3210),
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
        testPort(3199),
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
    const repoRoot = path.resolve(__dirname, '../..');
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
        testPort(3196),
        'rstest-e2e-fixture',
      ],
      appDir,
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
        ['--once', '--server-only', '--port', testPort(3207), packageDir],
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

  test('meteor test-packages honors source app dependency-install opt-out', async () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const packageJsonPath = path.join(appDir, 'package.json');
    const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(originalPackageJson);
    packageJson.meteor = {
      ...packageJson.meteor,
      autoInstallDeps: false,
    };
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

    try {
      const result = await runMeteorCommand(
        'test-packages',
        ['--once', '--server-only', '--port', testPort(3211), 'rstest-e2e-fixture'],
        appDir,
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
        },
      );
      const completed = await result.meteorProcess;
      const output = result.outputLines.join('\n');

      expect(completed.exitCode).not.toBe(0);
      expect(output).toContain('@meteorjs/rstest is missing');
      expect(output).not.toContain('Rstest Dependencies');
      expect(output).not.toContain('Rspack Dependencies');
    } finally {
      fs.writeFileSync(packageJsonPath, originalPackageJson);
    }
  }, 600_000);

  test('meteor test-packages rejects mixed Rstest and Tinytest ownership before build', async () => {
    const result = await runMeteorCommand(
      'test-packages',
      [
        '--once',
        '--port',
        testPort(3202),
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
    expect(output).toContain('Selected package tests are owned by different test runner engines');
    expect(output).toContain('local-test:rstest-e2e-fixture');
    expect(output).toContain('local-test:tinytest-e2e-fixture');
    expect(output).not.toContain('0 passed');
  }, 600_000);

  test('meteor test-packages rejects Rstest and Tinytest inside one package', async () => {
    const result = await runMeteorCommand(
      'test-packages',
      [
        '--once',
        '--port',
        testPort(3202),
        'rstest-tinytest-e2e-fixture',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = result.outputLines.join('\n');
    const normalizedOutput = output.replace(/\s+/g, ' ');

    expect(completed.exitCode).not.toBe(0);
    expect(normalizedOutput).toContain('local-test:rstest-tinytest-e2e-fixture');
    expect(normalizedOutput).toContain('test runner "rstest"');
    expect(normalizedOutput).toContain('test package "tinytest"');
    expect(normalizedOutput).toContain(
      'Migrate or remove tests using "tinytest"'
    );
    expect(normalizedOutput).toContain(
      'meteor test-packages rstest-tinytest-e2e-fixture`'
    );
    expect(normalizedOutput).toContain(
      'meteor test-packages rstest-tinytest-e2e-fixture ' +
        '--driver-package test-in-browser`'
    );
    expect(normalizedOutput).not.toContain('Rstest Dependencies');
    expect(normalizedOutput).not.toContain('[Meteor Rstest]');
    expect(normalizedOutput).not.toContain('0 passed');
  }, 600_000);
});
