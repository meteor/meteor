import fs from 'fs-extra';
import path from 'path';

import {
  cleanupTempDir,
  killProcessByPort,
  runMeteorTests,
  setupMeteorApp,
} from '../helpers';

const { linkLocalRspack } = require('../scripts/link-rspack');

const PORT = 3125;

const testFile = (name, title) => `import assert from 'assert';

describe('${name}', function () {
  it('${title}', function () {
    assert.ok(true);
  });
});
`;

describe('Regressions / .meteorignore negation patterns /', () => {
  let tempDir;

  beforeAll(async () => {
    tempDir = (await setupMeteorApp('server-only'))?.tempDir;

    await linkLocalRspack(tempDir);

    await fs.outputFile(
      path.join(tempDir, 'imports', 'included.tests.js'),
      testFile('included', 'runs the re-included test file'),
    );
    await fs.outputFile(
      path.join(tempDir, 'imports', 'excluded.tests.js'),
      testFile('excluded', 'runs the ignored test file'),
    );

    // Ignore every test file, then re-include one — the way a suite is sharded
    // across CI containers. Rspack used to drop the negation and load nothing,
    // reporting "0 passing" with exit code 0.
    await fs.writeFile(
      path.join(tempDir, '.meteorignore'),
      '*.tests.js\n!/imports/included.tests.js\n',
    );
  });

  afterAll(async () => {
    await killProcessByPort(PORT);
    await cleanupTempDir(tempDir);
  });

  it('runs only the test files a later negation pattern re-includes', async () => {
    const { outputLines } = await runMeteorTests(tempDir, PORT, {
      commandOptions: ['--once'],
      checkTestResults: true,
      testClient: false,
    });

    const output = outputLines.join('\n');

    expect(output).toContain('runs the re-included test file');
    expect(output).not.toContain('runs the ignored test file');
    expect(output).toMatch(/1 passing/);
  });
});
