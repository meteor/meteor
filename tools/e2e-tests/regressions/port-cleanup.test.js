import net from 'net';
import {
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  runMeteorApp,
  wait,
} from '../helpers';
import { setupMeteorRspackApp } from '../test-helpers';

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

function waitForProcessExit(proc) {
  return proc.then(
    () => undefined,
    () => undefined,
  );
}

describe("Regressions / PortCleanup /", () => {
  const port = 3146;
  const rspackPort = 18146;
  let tempDir;
  let meteorProcess;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorRspackApp({ appName: "react" }));
  });

  afterAll(async () => {
    await killMeteorProcess(meteorProcess);
    await killProcessByPort([port, rspackPort]);
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    meteorProcess = null;
    await killProcessByPort([port, rspackPort]);
  });

  afterEach(async () => {
    await killMeteorProcess(meteorProcess);
    await killProcessByPort([port, rspackPort]);
  });

  test("releases rspack port after SIGTERM", async () => {
    const result = await runMeteorApp(tempDir, port, {
      waitForOutput: `=> App running at http://localhost:${port}/`,
      env: {
        RSPACK_DEVSERVER_PORT: String(rspackPort),
      },
    });

    meteorProcess = result.meteorProcess;
    const exitPromise = waitForProcessExit(meteorProcess);

    expect(await isPortAvailable(rspackPort)).toBe(false);

    meteorProcess.kill("SIGTERM");
    await exitPromise;
    meteorProcess = null;

    await wait(1000);

    expect(await isPortAvailable(rspackPort)).toBe(true);
  });
});
