import {
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  runMeteorCommand,
  waitForMeteorOutput,
} from '../helpers';
import { setupMeteorRspackApp } from '../test-helpers';

const APP_PORT = 3154;
// 8077 + (3 + 1 + 5 + 4): what the rspack plugin derives for APP_PORT when
// RSPACK_DEVSERVER_PORT is unset. Only used for cleanup.
const DERIVED_DEVSERVER_PORT = 8090;

// The shared jest setup pins RSPACK_DEVSERVER_PORT, which is also the
// workaround for this bug — drop it so the run exercises the derived port.
function envWithoutDevServerPort() {
  const env = { ...process.env };
  delete env.RSPACK_DEVSERVER_PORT;
  return env;
}

describe('Regressions / Host-prefixed --port /', () => {
  let tempDir;
  let meteorProcess;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorRspackApp({ appName: 'react' }));
  });

  afterEach(async () => {
    await killMeteorProcess(meteorProcess);
    meteorProcess = null;
    await killProcessByPort([APP_PORT, DERIVED_DEVSERVER_PORT]);
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  it('starts rspack when --port carries a host prefix', async () => {
    const { meteorProcess: proc, outputLines } = await runMeteorCommand(
      'run',
      ['--port', `localhost:${APP_PORT}`],
      tempDir,
      {
        captureOutput: true,
        execaOptions: { env: envWithoutDevServerPort(), extendEnv: false },
      }
    );

    meteorProcess = proc;
    meteorProcess.catch(() => {});

    await waitForMeteorOutput(
      outputLines,
      `App running at http://localhost:${APP_PORT}/`,
      { meteorProcess }
    );

    const output = outputLines.join('\n');
    expect(output).not.toContain('ERR_SOCKET_BAD_PORT');
    expect(output).not.toContain('NaN');
  });
});
