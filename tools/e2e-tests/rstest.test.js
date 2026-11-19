import {
  cleanupTempDir,
  killMeteorProcess,
  killStrayAppProcesses,
  runMeteorCommand,
  setupMeteorApp,
  waitForMeteorOutput,
} from './helpers';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const { linkLocalModernTools } = require('./scripts/link-modern-tools.js');

const ANSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  'g',
);

function stripAnsi(value) {
  return value.replace(ANSI_PATTERN, '');
}

function createCoverageDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-coverage-'));
}

function readCoverageReport(coverageDir) {
  const reportFile = path.join(coverageDir, 'coverage-final.json');
  expect(fs.existsSync(reportFile)).toBe(true);
  expect(fs.readdirSync(coverageDir).sort()).toEqual(['coverage-final.json']);
  return JSON.parse(fs.readFileSync(reportFile, 'utf8'));
}

function expectCoveredSources(report, expectedSources) {
  for (const suffix of expectedSources) {
    const entry = Object.entries(report).find(([file]) =>
      file.replaceAll('\\', '/').endsWith(suffix)
    );
    if (!entry) {
      throw new Error(
        `Coverage report is missing ${suffix}; sources: ${Object.keys(report).join(', ')}`
      );
    }
    expect(Object.values(entry[1].s).some(value => value > 0)).toBe(true);
  }
}

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

describe('Meteor + Rstest integration', () => {
  let appDir;
  let portBase;
  let smartFixtureSource;
  let smartFixtureTarget;
  const activeWorkerCommands = new Set();
  const testPort = oldPort => String(portBase + (Number(oldPort) - 3195) * 2);

  beforeAll(async () => {
    portBase = await reservePortBlock(38);
    appDir = (await setupMeteorApp('rspack-rstest')).tempDir;
    await linkLocalModernTools(appDir);
    smartFixtureTarget = path.join(appDir, 'imports', 'rstest');
    smartFixtureSource = path.join(
      appDir,
      '.meteor',
      'smart-routing-fixtures',
    );
    fs.renameSync(smartFixtureTarget, smartFixtureSource);
  }, 600_000);

  afterAll(async () => {
    await cleanupTempDir(appDir);
  });

  afterEach(async () => {
    if (activeWorkerCommands.size === 0) return;
    const commands = [...activeWorkerCommands];
    activeWorkerCommands.clear();
    await Promise.all(commands.map(command => killMeteorProcess(command)));
    await killStrayAppProcesses();
  });

  test('meteor test automatically runs pure and Meteor-runtime projects', async () => {
    const result = await runMeteorCommand(
      'test',
      [
        '--once',
        '--server-only',
        '--port',
        testPort(3195),
        '--',
        '--reporters=verbose',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('pure Rstest uses Meteor-generated context');
    expect(output).toContain('pure Rstest supports inline snapshots');
    expect(output).toContain(
      'pure Rstest hoists module mocks through Meteor Rspack config'
    );
    expect(output).toContain(
      '✓ tests/rstest/runtime/server/mongo.test.js (1)'
    );
    expect(output).toContain(
      '✓ tests/rstest/runtime/server/concurrency.test.js (4)'
    );
    expect(output).toContain(
      '✓ tests/rstest/runtime/server/sentinel.test.js (1)'
    );
    expect(output).not.toContain('[Meteor-Rstest]');
    expect(output).not.toContain('outside Meteor-owned roots are delegated');
    expect(output).not.toContain('pure client project runs with jsdom');
    expect(output).not.toContain('Browser Mode runs in real Chromium');
    expect(output).not.toContain('Meteor runtime · web.browser');

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')
    );
    const rstestPackageJson = JSON.parse(fs.readFileSync(
      require.resolve('@meteorjs/rstest/package.json', { paths: [appDir] }),
      'utf8',
    ));
    expect(packageJson.dependencies['@meteorjs/rspack']).toMatch(/^file:/);
    expect(packageJson.devDependencies['@meteorjs/rstest']).toMatch(/^file:/);
    expect(rstestPackageJson.dependencies['@rstest/core']).toBe('0.11.6');
    expect(rstestPackageJson.dependencies['@rstest/adapter-rspack']).toBe('0.11.6');
    expect(packageJson.devDependencies['@rstest/browser']).toBe('0.11.6');
    expect(packageJson.devDependencies['@rstest/coverage-istanbul']).toBe('0.11.6');
    expect(packageJson.devDependencies['@rstest/playwright']).toBe('0.11.6');
    expect(packageJson.devDependencies.jsdom).toBe('29.1.1');
    expect(packageJson.devDependencies.playwright).toBe('1.59.0');
  }, 600_000);

  test('embeds upstream Rstest API in Meteor server', async () => {
    const fixture = path.join(
      appDir,
      'fixtures',
      'upstream-api.test.js.txt',
    );
    const target = path.join(
      appDir,
      'tests',
      'rstest',
      'runtime',
      'server',
      'upstream-api.test.js',
    );
    fs.copyFileSync(fixture, target);

    try {
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--server-only',
          '--project',
          'meteor-runtime-server',
          '--test-file',
          'upstream-api.test.js',
          '--port',
          testPort(3215),
          '--',
          '--reporters=verbose',
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: { reject: false },
        },
      );
      const completed = await result.meteorProcess;
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).toBe(0);
      expect(output).toContain('upstream case 1');
      expect(output).toContain('upstream case 2');
      expect(output).toContain('upstream fixture');
      expect(output).toContain(
        '✓ tests/rstest/runtime/server/upstream-api.test.js (3)',
      );
      expect(output).not.toContain('[Meteor-Rstest]');
      expect(output).not.toContain("Rstest API 'test' is not registered");
    } finally {
      fs.rmSync(target, { force: true });
    }
  }, 600_000);

  test('rejects attempts to mock Meteor-owned modules', async () => {
    const fixture = path.join(
      appDir,
      'fixtures',
      'unsupported-atmosphere-mock.test.js.txt',
    );
    const target = path.join(
      appDir,
      'tests',
      'rstest',
      'runtime',
      'server',
      'unsupported-atmosphere-mock.test.js',
    );
    fs.copyFileSync(fixture, target);

    try {
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--server-only',
          '--project',
          'meteor-runtime-server',
          '--test-file',
          'unsupported-atmosphere-mock.test.js',
          '--port',
          testPort(3217),
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: { reject: false },
        },
      );
      const completed = await result.meteorProcess;
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).toBe(1);
      expect(output).toContain('Cannot mock Meteor-owned module "meteor/mongo"');
      expect(output).toContain('Use dependency injection');
    } finally {
      fs.rmSync(target, { force: true });
    }
  }, 600_000);

  test('smart routing infers colocated tests and honors filename opt-ins', async () => {
    fs.cpSync(smartFixtureSource, smartFixtureTarget, { recursive: true });
    try {
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--server-only',
          '--test-file',
          'imports/rstest/*.test.js',
          '--port',
          testPort(3213),
          '--',
          '--reporters=verbose',
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: { reject: false },
        },
      );
      const completed = await result.meteorProcess;
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).toBe(0);
      expect(output).toContain(
        'colocated @rstest/core import selects native Rstest',
      );
      expect(output).toContain(
        'rstest filename marker supports global test APIs',
      );
      expect(output).toContain(
        'colocated transitive meteor import selects real Meteor host',
      );
      expect(output).toContain(
        'server Meteor filename marker runs against real Mongo',
      );
      expect(output).toContain(
        '✓ imports/rstest/automatic-runtime.test.js (1)',
      );
      expect(output).toContain(
        '✓ imports/rstest/mongo.server.meteor.rstest.test.js (1)',
      );
      expect(output).not.toContain('existing Meteor test discovery compatibility');
    } finally {
      fs.rmSync(smartFixtureTarget, { recursive: true, force: true });
    }
  }, 600_000);

  test('native and Meteor-runtime suites honor concurrent scheduling and limits', async () => {
    const result = await runMeteorCommand(
      'test',
      [
        '--once',
        '--server-only',
        '--project',
        'meteor-pure-server',
        '--project',
        'meteor-runtime-server',
        '--test-file',
        'concurrency.test.js',
        '--port',
        testPort(3214),
        '--',
        '--reporters=verbose',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    const completed = await result.meteorProcess;
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('native Rstest concurrent suite > alpha');
    expect(output).toContain('native Rstest concurrent suite > gamma');
    expect(output).toContain('waits for native concurrent cases');
    expect(output).toContain('Meteor runtime concurrent suite > alpha');
    expect(output).toContain('Meteor runtime concurrent suite > gamma');
    expect(output).toContain('waits for shared-runtime concurrent cases');
    expect(output).toContain(
      '✓ tests/rstest/runtime/server/concurrency.test.js (4)'
    );
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

  test('meteor update-snapshots repairs a Meteor-runtime mismatch', async () => {
    const snapshotFile = path.join(
      appDir,
      'tests',
      'rstest',
      'runtime',
      'server',
      '__snapshots__',
      'snapshot.test.js.snap',
    );
    const expectedSnapshot = fs.readFileSync(snapshotFile, 'utf8');
    const staleSnapshot = expectedSnapshot.replace(
      'meteor-server',
      'stale-host',
    );
    expect(staleSnapshot).not.toBe(expectedSnapshot);
    fs.writeFileSync(snapshotFile, staleSnapshot);
    const args = [
      '--once',
      '--server-only',
      '--project',
      'meteor-runtime-server',
      '--test-file',
      'snapshot.test.js',
      '--port',
      testPort(3216),
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
        output: stripAnsi(result.outputLines.join('\n')),
      };
    };

    try {
      const mismatch = await runSnapshotCommand([]);
      expect(mismatch.completed.exitCode).toBe(1);
      expect(mismatch.output).toContain('Meteor runtime supports committed snapshots');
      expect(fs.readFileSync(snapshotFile, 'utf8')).toBe(staleSnapshot);

      const update = await runSnapshotCommand(['--update-snapshots']);
      expect(update.completed.exitCode).toBe(0);
      expect(fs.readFileSync(snapshotFile, 'utf8')).toBe(expectedSnapshot);
    } finally {
      fs.writeFileSync(snapshotFile, expectedSnapshot);
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

  test('meteor coverage merges native, runtime, package, and full-app browser lanes once', async () => {
    const coverageDir = createCoverageDirectory();
    try {
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--full-app',
          '--project',
          'meteor-pure-server',
          '--project',
          'meteor-runtime-server',
          '--project',
          'meteor-runtime-client',
          '--project',
          'meteor-e2e',
          '--coverage',
          '--port',
          testPort(3217),
          '--',
          '--coverage.reporters=text',
          '--coverage.reporters=json',
          `--coverage.reportsDirectory=${coverageDir}`,
          '--coverage.include=tests/rstest/pure/server/coverage-target.js',
          '--coverage.include=imports/coverage/*.js',
          '--coverage.include=packages/rstest-e2e-fixture/fixture.js',
          '--coverage.exclude=**/*.test.*',
          '--coverage.thresholds.lines=1',
          '--coverage.reportOnFailure',
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: {
            reject: false,
          },
        },
      );
      const completed = await result.meteorProcess;
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).toBe(0);
      expect(output).toContain('✓ tests/rstest/pure/server/math.test.js (5)');
      expect(output).toContain('✓ tests/rstest/runtime/server/mongo.test.js (1)');
      expect(output).toContain('✓ tests/rstest/runtime/client/meteor.test.js (1)');
      expect(output).toContain('full-app Rstest Playwright drives Meteor-owned app lifecycle');
      expect(output.match(/All files/g)).toHaveLength(1);

      const report = readCoverageReport(coverageDir);
      expectCoveredSources(report, [
        '/tests/rstest/pure/server/coverage-target.js',
        '/imports/coverage/server-target.js',
        '/imports/coverage/client-target.js',
        '/imports/coverage/e2e-interaction-target.js',
        '/packages/rstest-e2e-fixture/fixture.js',
      ]);
    } finally {
      fs.rmSync(coverageDir, { recursive: true, force: true });
    }
  }, 900_000);

  test('config-only Meteor coverage activates Istanbul and rejects V8 before build', async () => {
    const coverageDir = createCoverageDirectory();
    try {
      const istanbul = await runMeteorCommand(
        'test',
        [
          '--once',
          '--server-only',
          '--project',
          'meteor-runtime-server',
          '--test-file',
          'mongo.test.js',
          '--port',
          testPort(3217),
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: {
            reject: false,
            env: {
              METEOR_RSTEST_E2E_CONFIG_COVERAGE_PROVIDER: 'istanbul',
              METEOR_RSTEST_E2E_COVERAGE_DIR: coverageDir,
            },
          },
        },
      );
      const istanbulCompleted = await istanbul.meteorProcess;
      expect(istanbulCompleted.exitCode).toBe(0);
      expectCoveredSources(readCoverageReport(coverageDir), [
        '/imports/coverage/server-target.js',
      ]);

      const v8 = await runMeteorCommand(
        'test',
        [
          '--once',
          '--server-only',
          '--project',
          'meteor-runtime-server',
          '--test-file',
          'mongo.test.js',
          '--port',
          testPort(3217),
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: {
            reject: false,
            env: {
              METEOR_RSTEST_E2E_CONFIG_COVERAGE_PROVIDER: 'v8',
            },
          },
        },
      );
      const v8Completed = await v8.meteorProcess;
      const v8Output = stripAnsi(v8.outputLines.join('\n'));
      expect(v8Completed.exitCode).toBe(1);
      expect(v8Output).toContain(
        'Meteor-hosted coverage requires the Istanbul provider',
      );
      expect(v8Output).not.toContain(
        'Meteor runtime project resolves Atmosphere packages',
      );
    } finally {
      fs.rmSync(coverageDir, { recursive: true, force: true });
    }
  }, 900_000);

  test('meteor coverage applies passing and impossible thresholds once', async () => {
    const runThreshold = async threshold => {
      const coverageDir = createCoverageDirectory();
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--server-only',
          '--project',
          'meteor-runtime-server',
          '--test-file',
          'mongo.test.js',
          '--coverage',
          '--port',
          testPort(3217),
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: {
            reject: false,
            env: {
              METEOR_RSTEST_E2E_COVERAGE_DIR: coverageDir,
              METEOR_RSTEST_E2E_LINES_THRESHOLD: String(threshold),
            },
          },
        },
      );
      return {
        completed: await result.meteorProcess,
        coverageDir,
        output: stripAnsi(result.outputLines.join('\n')),
      };
    };

    const passing = await runThreshold(1);
    try {
      expect(passing.completed.exitCode).toBe(0);
      readCoverageReport(passing.coverageDir);
    } finally {
      fs.rmSync(passing.coverageDir, { recursive: true, force: true });
    }

    const impossible = await runThreshold(101);
    try {
      expect(impossible.completed.exitCode).toBe(1);
      expect(impossible.output).toContain('does not meet 101%');
      readCoverageReport(impossible.coverageDir);
    } finally {
      fs.rmSync(impossible.coverageDir, { recursive: true, force: true });
    }
  }, 900_000);

  test('reportOnFailure writes coverage while preserving the test failure', async () => {
    const coverageDir = createCoverageDirectory();
    const testFile = path.join(
      appDir,
      'tests',
      'rstest',
      'runtime',
      'server',
      'mongo.test.js',
    );
    const originalTest = fs.readFileSync(testFile, 'utf8');
    const failingTest = originalTest.replace(
      'expect(document.value).toBe(42);',
      'expect(document.value).toBe(404);',
    );
    expect(failingTest).not.toBe(originalTest);
    fs.writeFileSync(testFile, failingTest);

    try {
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--server-only',
          '--project',
          'meteor-runtime-server',
          '--test-file',
          'mongo.test.js',
          '--coverage',
          '--port',
          testPort(3217),
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: {
            reject: false,
            env: {
              METEOR_RSTEST_E2E_COVERAGE_DIR: coverageDir,
              METEOR_RSTEST_E2E_LINES_THRESHOLD: '101',
              METEOR_RSTEST_E2E_REPORT_ON_FAILURE: 'true',
            },
          },
        },
      );
      const completed = await result.meteorProcess;
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).toBe(1);
      expect(output).toContain('Meteor runtime project resolves Atmosphere packages');
      expect(output).toContain('expected 42 to be 404');
      expect(output).toContain('does not meet 101%');
      readCoverageReport(coverageDir);
    } finally {
      fs.writeFileSync(testFile, originalTest);
      fs.rmSync(coverageDir, { recursive: true, force: true });
    }
  }, 600_000);

  test('coverage-disabled Meteor hosts expose no sentinel or report', async () => {
    const coverageDir = createCoverageDirectory();
    try {
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--project',
          'meteor-runtime-server',
          '--project',
          'meteor-runtime-client',
          '--test-file',
          'mongo.test.js',
          '--test-file',
          'meteor.test.js',
          '--port',
          testPort(3217),
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: {
            reject: false,
            env: {
              METEOR_RSTEST_E2E_COVERAGE_DIR: coverageDir,
              METEOR_RSTEST_EXPECT_NO_COVERAGE: 'true',
            },
          },
        },
      );
      const completed = await result.meteorProcess;
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).toBe(0);
      expect(output).toContain('✓ tests/rstest/runtime/server/mongo.test.js (1)');
      expect(output).toContain('✓ tests/rstest/runtime/client/meteor.test.js (1)');
      expect(fs.readdirSync(coverageDir)).toEqual([]);
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
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(completed.exitCode).toBe(0);
    expect(output).toContain(
      '✓ tests/rstest/runtime/server/mongo.test.js (1)'
    );
    expect(output).toContain(
      '- tests/rstest/runtime/server/sentinel.test.js (1)'
    );
    expect(output).toContain(
      '- tests/rstest/runtime/server/concurrency.test.js (4)'
    );
    expect(output).toContain('Test Files  1 passed | 3 skipped (4)');
    expect(output).toContain('1 passed | 6 skipped (7)');
    expect(output).not.toContain('Started Meteor Rstest browser');
    expect(output).not.toContain('Meteor runtime · web.browser');
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
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(completed.exitCode).toBe(0);
    expect(output).toContain(
      '✓ tests/rstest/runtime/server/mongo.test.js (1)'
    );
    expect(output).not.toContain('Meteor runtime name filter leaves this sentinel unselected');
  }, 600_000);

  test('meteor runtime workers isolate Mongo and aggregate sibling results', async () => {
    const peerFile = path.join(
      appDir,
      'tests',
      'rstest',
      'runtime',
      'server',
      'mongo-worker-peer.test.js',
    );
    const originalPeer = fs.readFileSync(peerFile, 'utf8');
    const args = [
      '--once',
      '--server-only',
      '--project',
      'meteor-runtime-server',
      '--test-file',
      'mongo.test.js',
      '--test-file',
      'mongo-worker-peer.test.js',
      '--runtime-workers',
      '2',
      '--port',
      testPort(3212),
    ];
    const runPool = async (extraArgs = []) => {
      const result = await runMeteorCommand('test', [...args, ...extraArgs], appDir, {
        captureOutput: true,
        execaOptions: { reject: false },
      });
      activeWorkerCommands.add(result.meteorProcess);
      try {
        return {
          completed: await result.meteorProcess,
          output: stripAnsi(result.outputLines.join('\n')),
        };
      } finally {
        activeWorkerCommands.delete(result.meteorProcess);
      }
    };

    try {
      const passed = await runPool();
      const base = Number(testPort(3212));
      expect(passed.completed.exitCode).toBe(0);
      expect(passed.output).toContain(
        `[test worker 1/2] proxy=${base} mongo=${base + 1} id=server-1`
      );
      expect(passed.output).toContain(
        `[test worker 2/2] proxy=${base + 2} mongo=${base + 3} id=server-2`
      );
      expect(passed.output).toContain('[Meteor Rstest fixture] worker=server-1');
      expect(passed.output).toContain('[Meteor Rstest fixture] worker=server-2');
      expect(passed.output).toContain(
        '✓ tests/rstest/runtime/server/mongo.test.js (1)'
      );
      expect(passed.output).toContain(
        '✓ tests/rstest/runtime/server/mongo-worker-peer.test.js (1)'
      );
      expect(passed.output).toContain('Test Files  2 passed');
      expect(passed.output).not.toMatch(/\(\d+ms\) \[server-[12]\]/);
      expect(passed.output).not.toContain('Meteor runtime · 2 workers');
      expect(passed.output).not.toContain('Meteor runtime · server');

      const failingPeer = originalPeer.replace(
        'expect(document.workerId).toBe(workerId);',
        "expect(document.workerId).toBe('intentional-worker-failure');",
      );
      expect(failingPeer).not.toBe(originalPeer);
      fs.writeFileSync(peerFile, failingPeer);
      const failed = await runPool(['--', '--reporters=verbose']);
      expect(failed.completed.exitCode).toBe(1);
      expect(failed.output).toContain(
        'Meteor runtime worker peer owns an isolated Mongo database'
      );
      expect(failed.output).toContain(
        '× tests/rstest/runtime/server/mongo-worker-peer.test.js (1)'
      );
      expect(failed.output).toContain(
        '✓ tests/rstest/runtime/server/mongo.test.js (1)'
      );
      expect(failed.output).toContain('1 failed | 1 passed (2)');
      expect(failed.output).not.toContain('Meteor runtime · 2 workers');
      expect(failed.output).not.toContain('[Meteor-Rstest]');
      expect(failed.output).toMatch(
        /× Meteor runtime worker peer owns an isolated Mongo database \(\d+ms\) \[server-[12]\]/
      );
    } finally {
      fs.writeFileSync(peerFile, originalPeer);
    }
  }, 900_000);

  test('meteor runtime workers merge one final coverage report', async () => {
    const coverageDir = createCoverageDirectory();
    try {
      const result = await runMeteorCommand(
        'test',
        [
          '--once',
          '--server-only',
          '--project',
          'meteor-runtime-server',
          '--test-file',
          'mongo.test.js',
          '--test-file',
          'mongo-worker-peer.test.js',
          '--runtime-workers',
          '2',
          '--coverage',
          '--port',
          testPort(3217),
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: {
            reject: false,
            env: { METEOR_RSTEST_E2E_COVERAGE_DIR: coverageDir },
          },
        },
      );
      activeWorkerCommands.add(result.meteorProcess);
      let completed;
      try {
        completed = await result.meteorProcess;
      } finally {
        activeWorkerCommands.delete(result.meteorProcess);
      }
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).toBe(0);
      expect(output).toContain('[Meteor Rstest fixture] worker=server-1');
      expect(output).toContain('[Meteor Rstest fixture] worker=server-2');
      const report = readCoverageReport(coverageDir);
      expectCoveredSources(report, ['/imports/coverage/server-target.js']);
    } finally {
      fs.rmSync(coverageDir, { recursive: true, force: true });
    }
  }, 900_000);

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
    const output = stripAnsi(result.outputLines.join('\n'));

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
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('tests/rstest/pure/client/dom.test.js');
    expect(output).toContain('tests/rstest/browser/dom.test.js');
    expect(output).toContain(
      '✓ tests/rstest/runtime/client/meteor.test.js (1)'
    );
    expect(
      output.match(/✓ tests\/rstest\/runtime\/client\/meteor\.test\.js \(1\)/g)
    ).toHaveLength(1);
    expect(output).not.toContain(
      'Meteor client executor resolves Atmosphere runtime in real browser'
    );
    expect(output).not.toContain('tests/rstest/pure/server/math.test.js');
    expect(output).not.toContain('Meteor runtime · server');
  }, 600_000);

  test('meteor full-app runs external E2E through project-owned Rstest Playwright fixture', async () => {
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
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('full-app Rstest Playwright drives Meteor-owned app lifecycle');
    expect(output).not.toContain('[Meteor-Rstest]');
    expect(output).not.toContain('Meteor runtime · external');
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
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(completed.exitCode).toBe(0);
    expect(output).toContain(
      '✓ tests/rstest/runtime/server/mongo.test.js (1)'
    );
    expect(output).toContain(
      '✓ tests/rstest/runtime/server/sentinel.test.js (1)'
    );
  }, 600_000);

  test('meteor native watch recovers after an imported dependency failure', async () => {
    const nativeFile = path.join(
      appDir,
      'tests',
      'rstest',
      'pure',
      'server',
      'math.test.js',
    );
    const dependencyFile = path.join(
      path.dirname(nativeFile),
      'coverage-target.js',
    );
    const originalTest = fs.readFileSync(nativeFile, 'utf8');
    const originalDependency = fs.readFileSync(dependencyFile, 'utf8');
    const initialName = 'pure Rstest coverage instruments imported Rspack source';
    const recoveryName = `native Rstest watch recovers after dependency fix ${Date.now()}`;
    const failingDependency = originalDependency.replace(
      "return 'Rspack + Rstest';",
      "return 'watch-induced failure';",
    );
    const recoveryTest = originalTest.replace(initialName, recoveryName);
    expect(failingDependency).not.toBe(originalDependency);
    expect(recoveryTest).not.toBe(originalTest);

    const result = await runMeteorCommand(
      'test',
      [
        '--verbose',
        '--server-only',
        '--project',
        'meteor-pure-server',
        '--test-file',
        'tests/rstest/pure/server/math.test.js',
        '--port',
        testPort(3209),
        '--',
        '--reporters=verbose',
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    try {
      await waitForMeteorOutput(
        result.outputLines,
        initialName,
        { meteorProcess: result.meteorProcess, timeout: 120_000 },
      );

      fs.writeFileSync(dependencyFile, failingDependency);
      await waitForMeteorOutput(
        result.outputLines,
        `✗ ${initialName}`,
        { meteorProcess: result.meteorProcess, timeout: 120_000 },
      );

      fs.writeFileSync(dependencyFile, originalDependency);
      fs.writeFileSync(nativeFile, recoveryTest);
      await waitForMeteorOutput(
        result.outputLines,
        recoveryName,
        { meteorProcess: result.meteorProcess, timeout: 120_000 },
      );

      const output = stripAnsi(result.outputLines.join('\n'));
      expect(output).toContain(`✗ ${initialName}`);
      expect(output).toContain(`✓ ${recoveryName}`);
      expect(output).not.toContain('[Meteor-Rstest]');
    } finally {
      await killMeteorProcess(result.meteorProcess);
      fs.writeFileSync(nativeFile, originalTest);
      fs.writeFileSync(dependencyFile, originalDependency);
    }
  }, 600_000);

  test('meteor verbose watch recovers after a runtime dependency failure', async () => {
    const runtimeFile = path.join(
      appDir,
      'tests',
      'rstest',
      'runtime',
      'server',
      'mongo.test.js',
    );
    const dependencyFile = path.join(path.dirname(runtimeFile), 'runtime-value.js');
    const originalTest = fs.readFileSync(runtimeFile, 'utf8');
    const originalDependency = fs.readFileSync(dependencyFile, 'utf8');
    const initialName = 'Meteor runtime project resolves Atmosphere packages';
    const recoveryName = `Meteor runtime watch recovers after dependency fix ${Date.now()}`;
    const failingDependency = originalDependency.replace('42', '41');
    const recoveryTest = originalTest.replace(initialName, recoveryName);
    expect(failingDependency).not.toBe(originalDependency);
    expect(recoveryTest).not.toBe(originalTest);
    const result = await runMeteorCommand(
      'test',
      [
        '--verbose',
        '--project',
        'meteor-runtime-server',
        '--port',
        testPort(3209),
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: { reject: false },
      }
    );
    try {
      await waitForMeteorOutput(
        result.outputLines,
        '✓ tests/rstest/runtime/server/mongo.test.js (1)',
        { meteorProcess: result.meteorProcess, timeout: 120_000 },
      );
      const firstOutput = stripAnsi(result.outputLines.join('\n'));
      expect(firstOutput).not.toContain('[Meteor-Rstest]');
      expect(firstOutput).not.toContain('outside Meteor-owned roots are delegated');
      expect(firstOutput).toContain(initialName);

      await waitForMeteorOutput(
        result.outputLines,
        '=> App running at',
        { meteorProcess: result.meteorProcess, timeout: 30_000 },
      );

      fs.writeFileSync(dependencyFile, failingDependency);
      await waitForMeteorOutput(
        result.outputLines,
        `× ${initialName}`,
        { meteorProcess: result.meteorProcess, timeout: 120_000 },
      );

      fs.writeFileSync(dependencyFile, originalDependency);
      fs.writeFileSync(runtimeFile, recoveryTest);
      await waitForMeteorOutput(
        result.outputLines,
        recoveryName,
        { meteorProcess: result.meteorProcess, timeout: 120_000 },
      );

      const rebuiltOutput = stripAnsi(result.outputLines.join('\n'));
      expect(rebuiltOutput).toContain(`× ${initialName}`);
      expect(rebuiltOutput).toContain(`✓ ${recoveryName}`);
      expect(rebuiltOutput).not.toContain('[Meteor-Rstest]');
    } finally {
      await killMeteorProcess(result.meteorProcess);
      fs.writeFileSync(runtimeFile, originalTest);
      fs.writeFileSync(dependencyFile, originalDependency);
    }
  }, 600_000);

  test('protocol JSON requires explicit Rstest debug environment', async () => {
    const result = await runMeteorCommand(
      'test',
      [
        '--once',
        '--verbose',
        '--project',
        'meteor-runtime-server',
        '--port',
        testPort(3209),
      ],
      appDir,
      {
        captureOutput: true,
        execaOptions: {
          reject: false,
          env: { METEOR_RSTEST_DEBUG: '1' },
        },
      }
    );
    const completed = await result.meteorProcess;
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(completed.exitCode).toBe(0);
    expect(output).toMatch(
      /\[Meteor-Rstest\] {"type":"result","protocolVersion":1,"generation":1/
    );
    expect(output).toContain(
      'Meteor runtime project resolves Atmosphere packages'
    );
    expect(output).toContain(
      '✓ tests/rstest/runtime/server/mongo.test.js (1)'
    );
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
      import { expect, test } from '@rstest/core';
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
          '--',
          '--reporters=verbose',
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: { reject: false },
        }
      );
      const completed = await result.meteorProcess;
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).not.toBe(0);
      expect(output).toContain('intentional transported runtime failure');
      expect(output).toContain(
        'Expected {"compiler":"rspack"} to equal {"compiler":"other"}'
      );
      expect(output).toContain(
        '× tests/rstest/runtime/server/intentional-failure.test.js (1)'
      );
      expect(output).toContain('1 failed');
      expect(output).toMatch(
        /× intentional transported runtime failure \(\d+ms\)/
      );
      expect(output).not.toContain('[Meteor-Rstest]');
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
        '--test-file',
        'tests/legacy/mocha.tests.js',
        '--test-file',
        'imports/api/existing-format.tests.js',
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
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(output).toContain('preserves callback done and Mocha this.timeout semantics');
    expect(output).toContain('keeps unmigrated files outside tests/legacy on real Mocha');
    expect(output).toContain('2 passing');
  }, 600_000);

  test('meteor test-packages keeps server/client local-test Isobuild construction', async () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const packagesPath = path.join(appDir, '.meteor', 'packages');
    const sourceDependencyRoot = path.join(
      appDir,
      'node_modules',
      '@babel',
      'runtime',
    );
    const sourceDependencyHelpers = path.join(sourceDependencyRoot, 'helpers');
    fs.rmSync(path.join(sourceDependencyRoot, '.meteor-portable-2.json'), {
      force: true,
    });
    expect(fs.lstatSync(sourceDependencyHelpers).isSymbolicLink()).toBe(false);
    fs.writeFileSync(
      packagesPath,
      fs.readFileSync(packagesPath, 'utf8').replace(/^rstest(?:@[^\n]+)?\n/m, ''),
    );
    const packageEnv = {
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
    };
    const runPackageTests = args => runMeteorCommand(
      'test-packages',
      args,
      appDir,
      {
        captureOutput: true,
        execaOptions: {
          reject: false,
          env: packageEnv,
        },
      },
    );
    const result = await runPackageTests([
      '--once',
      '--port',
      testPort(3196),
      'rstest-e2e-fixture',
    ]);
    const completed = await result.meteorProcess;
    const output = stripAnsi(result.outputLines.join('\n'));

    expect(completed.exitCode).toBe(0);
    expect(output).toContain('✓ rstest-e2e-fixture/fixture.tests.js (1)');
    expect(output).toContain('✓ rstest-e2e-fixture/fixture.tests.js (2)');
    expect(output).not.toContain('Package.onTest keeps Isobuild and Atmosphere resolution');
    expect(output).not.toContain('Package.onTest client executor runs in Meteor browser');

    expect(fs.lstatSync(sourceDependencyHelpers).isSymbolicLink()).toBe(false);

    const repeated = await runPackageTests([
      '--once',
      '--server-only',
      '--port',
      testPort(3213),
      'rstest-e2e-fixture',
    ]);
    const repeatedCompleted = await repeated.meteorProcess;
    const repeatedOutput = stripAnsi(repeated.outputLines.join('\n'));

    expect(repeatedCompleted.exitCode).toBe(0);
    expect(repeatedOutput).toContain(
      '✓ rstest-e2e-fixture/fixture.tests.js (1)'
    );
  }, 600_000);

  test('meteor test-packages coverage reports the physical local package source', async () => {
    const coverageDir = path.join(appDir, 'coverage');
    const repoRoot = path.resolve(__dirname, '../..');
    fs.rmSync(coverageDir, { recursive: true, force: true });
    try {
      const result = await runMeteorCommand(
        'test-packages',
        [
          '--once',
          '--coverage',
          '--port',
          testPort(3217),
          'rstest-e2e-fixture',
        ],
        appDir,
        {
          captureOutput: true,
          execaOptions: {
            reject: false,
            env: {
              METEOR_RSTEST_E2E_CONFIG_COVERAGE_PROVIDER: 'istanbul',
              METEOR_RSTEST_E2E_PACKAGE_LINES_THRESHOLD: '1',
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
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).toBe(0);
      expect(output).toContain('✓ rstest-e2e-fixture/fixture.tests.js (1)');
      expect(output).toContain('✓ rstest-e2e-fixture/fixture.tests.js (2)');
      const report = readCoverageReport(coverageDir);
      const target = Object.entries(report).find(([file]) =>
        file.replaceAll('\\', '/').endsWith(
          '/packages/rstest-e2e-fixture/fixture.js'
        )
      );
      expect(target).toBeDefined();
      expect(fs.realpathSync(target[0])).toBe(fs.realpathSync(path.join(
        appDir,
        'packages',
        'rstest-e2e-fixture',
        'fixture.js',
      )));
      expect(Object.values(target[1].s).some(value => value > 0)).toBe(true);
    } finally {
      fs.rmSync(coverageDir, { recursive: true, force: true });
    }
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
      const output = stripAnsi(result.outputLines.join('\n'));

      expect(completed.exitCode).toBe(0);
      expect(output).toContain('✓ rstest-e2e-fixture/fixture.tests.js (1)');
      expect(output).not.toContain('Package.onTest keeps Isobuild and Atmosphere resolution');
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
