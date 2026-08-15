import net from 'net';
import {
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  killStrayAppProcesses,
  runMeteorApp,
  wait,
} from '../helpers';
import { assertMeteorReactApp } from '../assertions';
import { setupMeteorRspackApp } from '../test-helpers';

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function waitForProcessExit(proc) {
  return proc.then(
    () => undefined,
    () => undefined,
  );
}

async function waitForPortState(predicate, { timeout = 5000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeout}ms waiting for port state`);
    }
    await wait(interval);
  }
}

describe("Regressions / PortCleanup /", () => {
  const port = 3146;
  const rspackPort = 18146;
  // origin/devel derives 8091 as 8077 + the digit sum of app port 3146.
  const oldDerivedRspackPort = 8091;
  let tempDir;
  let meteorProcess;
  let occupiedPortServer;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorRspackApp({ appName: "react" }));
  });

  afterAll(async () => {
    await killMeteorProcess(meteorProcess);
    await closeServer(occupiedPortServer);
    await killStrayAppProcesses();
    await killProcessByPort([port, rspackPort, oldDerivedRspackPort]);
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    meteorProcess = null;
    occupiedPortServer = null;
    await killProcessByPort([port, rspackPort, oldDerivedRspackPort]);
  });

  afterEach(async () => {
    await killMeteorProcess(meteorProcess);
    meteorProcess = null;
    await closeServer(occupiedPortServer);
    occupiedPortServer = null;
    await killStrayAppProcesses();
    await killProcessByPort([port, rspackPort, oldDerivedRspackPort]);
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

    await waitForPortState(async () => (await isPortAvailable(rspackPort)) === false, {
      timeout: 5000,
      interval: 100,
    });

    meteorProcess.kill("SIGTERM");
    await exitPromise;
    meteorProcess = null;

    await waitForPortState(async () => (await isPortAvailable(rspackPort)) === true, {
      timeout: 5000,
      interval: 100,
    });
  });

  test("starts on a different HMR port when the derived port is occupied", async () => {
    occupiedPortServer = await listenOnPort(oldDerivedRspackPort);

    const previousRspackDevServerPort = process.env.RSPACK_DEVSERVER_PORT;
    delete process.env.RSPACK_DEVSERVER_PORT;
    let result;
    try {
      result = await runMeteorApp(tempDir, port, {
        waitForOutput: /=> Started Rspack HMR server at /,
        failOnOutput: /EADDRINUSE/,
      });
    } finally {
      if (previousRspackDevServerPort === undefined) {
        delete process.env.RSPACK_DEVSERVER_PORT;
      } else {
        process.env.RSPACK_DEVSERVER_PORT = previousRspackDevServerPort;
      }
    }

    meteorProcess = result.meteorProcess;
    const hmrLine = result.outputLines.find((line) =>
      line.includes("=> Started Rspack HMR server at ")
    );
    const hmrPortMatch = hmrLine?.match(/Started Rspack HMR server at .+:(\d+)\//);

    expect(hmrPortMatch).not.toBeNull();
    expect(Number(hmrPortMatch[1])).not.toBe(oldDerivedRspackPort);
    await assertMeteorReactApp(port);
  });
});
