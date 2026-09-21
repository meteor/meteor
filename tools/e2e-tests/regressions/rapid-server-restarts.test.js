import fs from 'fs-extra';
import path from 'path';
import {
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  runMeteorCommand,
  wait,
  waitForMeteorOutput,
} from '../helpers';
import { assertMeteorReactApp, assertRspackScriptTag } from '../assertions';
import { setupMeteorRspackApp } from '../test-helpers';

const APP_PORT = 3155;
const RSPACK_PORT = 18155;

function serverSource(revision) {
  return `
import { WebApp } from 'meteor/webapp';

// Match the slow startup and shutdown in the #14755 reproduction so rapid
// saves overlap a server restart and the IPC readiness handshake.
const bootDelayUntil = Date.now() + 1200;
while (Date.now() < bootDelayUntil) {}
process.on('SIGTERM', () => setTimeout(() => process.exit(0), 800));

WebApp.handlers.use('/ipc-restart-status', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ revision: ${revision}, pid: process.pid }));
});
`;
}

describe('Regressions / Rapid server restarts /', () => {
  let tempDir;
  let meteorProcess;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorRspackApp({ appName: 'react' }));
  }, process.env.CI ? 600000 : 300000);

  afterEach(async () => {
    await killMeteorProcess(meteorProcess);
    meteorProcess = null;
    await killProcessByPort([APP_PORT, RSPACK_PORT]);
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  it('keeps the dev server and Rspack client working after rapid server edits', async () => {
    const serverFile = path.join(tempDir, 'server/main.js');
    await fs.writeFile(serverFile, serverSource(0));

    const { meteorProcess: proc, outputLines } = await runMeteorCommand(
      'run', ['--port', String(APP_PORT)], tempDir, {
        captureOutput: true,
        execaOptions: { env: { ...process.env, RSPACK_DEVSERVER_PORT: String(RSPACK_PORT) } },
      },
    );
    meteorProcess = proc;
    meteorProcess.catch(() => {});

    await waitForMeteorOutput(outputLines, `App running at http://localhost:${APP_PORT}/`, {
      meteorProcess,
    });
    await assertMeteorReactApp(APP_PORT, { title: 'react' });

    async function waitForRevision(revision) {
      let status;
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        if (meteorProcess.exitCode !== null) {
          throw new Error(`meteor run exited during a restart:\n${outputLines.join('\n')}`);
        }
        try {
          const response = await fetch(`http://localhost:${APP_PORT}/ipc-restart-status`, {
            signal: AbortSignal.timeout(2000),
          });
          status = await response.json();
          if (status.revision === revision) return status;
        } catch {
          // Requests can be interrupted while the app process is replaced.
        }
        await wait(100);
      }
      throw new Error(`Server did not reach revision ${revision}; last response: ${JSON.stringify(status)}\n${outputLines.join('\n')}`);
    }

    let previous = await waitForRevision(0);
    for (let burst = 0; burst < 2; burst++) {
      for (let edit = 1; edit <= 8; edit++) {
        await fs.writeFile(serverFile, serverSource(burst * 8 + edit));
        await wait(250);
      }
      const current = await waitForRevision((burst + 1) * 8);
      expect(current.pid).not.toBe(previous.pid);
      previous = current;
    }

    // A later ordinary edit must still restart the app after both bursts.
    await fs.writeFile(serverFile, serverSource(17));
    const final = await waitForRevision(17);
    expect(final.pid).not.toBe(previous.pid);
    await assertMeteorReactApp(APP_PORT, { title: 'react' });
    await fs.appendFile(path.join(tempDir, 'client/main.jsx'), '\nglobalThis.__ipcRefresh = "after-restarts";\n');
    await page.waitForFunction(() => globalThis.__ipcRefresh === 'after-restarts');
    await assertRspackScriptTag(APP_PORT);
    expect(meteorProcess.exitCode).toBeNull();
    expect(outputLines.join('\n')).not.toMatch(/Error: write EPIPE|ERR_IPC_CHANNEL_CLOSED/);
  }, 240000);
});
