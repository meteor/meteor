import {
  cleanupTempDir,
  killProcessByPort,
  runMeteorTests,
  setupMeteorApp,
} from './helpers';

const { linkLocalRspack } = require('./scripts/link-rspack');

describe('tla /', () => {
  const port = 3145;
  let tempDir;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorApp('tla'));
    await linkLocalRspack(tempDir);
  });

  afterAll(async () => {
    await killProcessByPort(port);
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    await killProcessByPort(port);
  });

  test('"meteor test --full-app --once" runs tla tests', async () => {
    const result = await runMeteorTests(tempDir, port, {
      commandOptions: ['--full-app', '--once'],
      checkTestResults: true,
      testClient: false,
    });

    const output = result.outputLines.join('\n');
    expect(output).toContain('[tla] async-dep settled');
    expect(output).toContain('[tla] app test loaded');
    expect(output).toMatch(/\b1 passing\b/);
    expect(output).not.toMatch(/\b0 passing\b/);
  });
});
