import {
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  runMeteorApp,
  runMeteorTests,
  setupMeteorApp,
} from './helpers';

const { linkLocalRspack } = require('./scripts/link-rspack');

describe('Regressions / tla /', () => {
  const port = 3145;
  let tempDir;
  let meteorProcess;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorApp('tla', {
      tempDirSegments: ['private'],
    }));
    expect(tempDir.split(/[\\/]/)).toContain('private');
    await linkLocalRspack(tempDir);
  });

  afterAll(async () => {
    await killProcessByPort(port);
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    await killProcessByPort(port);
  });

  afterEach(async () => {
    await killMeteorProcess(meteorProcess);
    meteorProcess = null;
  });

  test('"meteor run" waits for server TLA dependencies', async () => {
    const result = await runMeteorApp(tempDir, port, {
      waitForOutput: '[tla] server main loaded: ready',
      skipWaitOn: true,
    });
    meteorProcess = result.meteorProcess;

    const output = result.outputLines.join('\n');
    const settledIndex = output.indexOf('[tla] async-dep settled');
    const mainIndex = output.indexOf('[tla] server main loaded: ready');

    expect(settledIndex).toBeGreaterThanOrEqual(0);
    expect(mainIndex).toBeGreaterThan(settledIndex);
  });

  test('"meteor test --full-app --once" runs tests below a private path segment', async () => {
    const result = await runMeteorTests(tempDir, port, {
      commandOptions: ['--full-app', '--once'],
      checkTestResults: true,
      testClient: false,
    });
    meteorProcess = result.meteorProcess;

    const output = result.outputLines.join('\n');
    expect(output).toContain('[tla] async-dep settled');
    expect(output).toContain('[tla] app test loaded');
    expect(output).toMatch(/\b1 passing\b/);
    expect(output).not.toMatch(/\b0 passing\b/);
    expect(output).not.toContain(
      'ReferenceError: __rspackBundle is not defined',
    );
  });
});
