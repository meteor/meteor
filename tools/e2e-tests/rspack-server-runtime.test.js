import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  runMeteorApp,
  runMeteorCommand,
  setupMeteorApp,
  waitForMeteorOutput,
} from './helpers';

const { linkLocalRspack } = require('./scripts/link-rspack');

const ABSOLUTE_LOCAL_PORTS = [3130, 18130];
const DELAYED_IMPORT_PORTS = [3131, 18131];

async function prepareServerOnlyApp(ports) {
  await killProcessByPort(ports);

  let tempDir;
  try {
    ({ tempDir } = await setupMeteorApp('server-only'));
    await runMeteorCommand('add', ['rspack'], tempDir, {
      checkExitCode: true,
    });

    if (process.env.NPM_LINK_RSPACK !== 'false') {
      await linkLocalRspack(tempDir);
    }

    return tempDir;
  } catch (error) {
    await killProcessByPort(ports);
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
    throw error;
  }
}

async function cleanupRegressionApp({ tempDir, meteorProcess, ports }) {
  if (meteorProcess) {
    await killMeteorProcess(meteorProcess);
  }
  await killProcessByPort(ports);
  if (tempDir) {
    await cleanupTempDir(tempDir);
  }
}

describe('Regressions / Rspack Server Runtime /', () => {
  test('supports an absolute METEOR_LOCAL_DIR outside the app', async () => {
    const meteorLocalDir = path.join(
      os.tmpdir(),
      `meteor-e2e-absolute-local-${process.pid}-${Date.now()}`
    );
    const buildDir = `_build-${path.basename(meteorLocalDir)}`;
    let tempDir;
    let meteorProcess;

    try {
      await fs.remove(meteorLocalDir);
      tempDir = await prepareServerOnlyApp(ABSOLUTE_LOCAL_PORTS);

      const result = await runMeteorCommand(
        'run',
        ['--port', String(ABSOLUTE_LOCAL_PORTS[0])],
        tempDir,
        {
          captureOutput: true,
          env: {
            METEOR_LOCAL_DIR: meteorLocalDir,
            RSPACK_DEVSERVER_PORT: String(ABSOLUTE_LOCAL_PORTS[1]),
          },
        }
      );
      meteorProcess = result.meteorProcess;

      const startupResult = await waitForMeteorOutput(
        result.outputLines,
        /=> App running at|Cannot find module .*server-rspack\.js/,
        {
          timeout: 90000,
          meteorProcess,
        }
      );
      expect(startupResult).toContain('=> App running at');

      expect(
        await fs.pathExists(
          path.join(tempDir, buildDir, 'main-dev', 'server-rspack.js')
        )
      ).toBe(true);
      expect(await fs.pathExists(path.join(meteorLocalDir, 'build'))).toBe(true);
    } finally {
      await cleanupRegressionApp({
        tempDir,
        meteorProcess,
        ports: ABSOLUTE_LOCAL_PORTS,
      });
      await fs.remove(meteorLocalDir);
    }
  });

  test('resolves a Meteor package imported after server startup', async () => {
    let tempDir;
    let meteorProcess;

    try {
      tempDir = await prepareServerOnlyApp(DELAYED_IMPORT_PORTS);

      await fs.writeFile(
        path.join(tempDir, 'server', 'delayed-meteor-import.js'),
        `import { Random } from 'meteor/random';

export function createDelayedId() {
  return Random.id();
}
`
      );
      await fs.writeFile(
        path.join(tempDir, 'server', 'main.js'),
        `import { Meteor } from 'meteor/meteor';

console.log('server runtime regression fixture loaded');

Meteor.setTimeout(async () => {
  try {
    const { createDelayedId } = await import('./delayed-meteor-import.js');
    console.log(\`delayed Meteor package import loaded: \${createDelayedId()}\`);
  } catch (error) {
    console.error(
      \`delayed Meteor package import failed: \${error.code || error.message}\`
    );
  }
}, 100);
`
      );

      const result = await runMeteorApp(tempDir, DELAYED_IMPORT_PORTS[0], {
        waitForOutput: '=> App running at',
        env: {
          RSPACK_DEVSERVER_PORT: String(DELAYED_IMPORT_PORTS[1]),
        },
      });
      meteorProcess = result.meteorProcess;

      const linkedServerApp = await fs.readFile(
        path.join(
          tempDir,
          '.meteor/local/build/programs/server/app/app.js'
        ),
        'utf8'
      );
      expect(linkedServerApp).not.toContain(
        'delayed Meteor package import loaded'
      );

      const delayedImportResult = await waitForMeteorOutput(
        result.outputLines,
        /delayed Meteor package import (?:loaded|failed)/,
        { timeout: 15000, meteorProcess }
      );
      expect(delayedImportResult).toContain(
        'delayed Meteor package import loaded'
      );
    } finally {
      await cleanupRegressionApp({
        tempDir,
        meteorProcess,
        ports: DELAYED_IMPORT_PORTS,
      });
    }
  });
});
