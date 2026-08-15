import net from 'net';
import {
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  killStrayAppProcesses,
  runMeteorApp,
  wait,
  waitForMeteorOutput,
} from '../helpers';
import { assertMeteorReactApp } from '../assertions';
import { setupMeteorRspackApp } from '../test-helpers';
import { formatDevServerHost } from '../../../npm-packages/meteor-rspack/lib/meteorRspackHelpers';

describe("Rspack dev-server URL /", () => {
  test.each([
    ["::", "[::]"],
    ["::1", "[::1]"],
    ["127.0.0.1", "127.0.0.1"],
    ["localhost", "localhost"],
  ])("formats host %s as %s", (host, expected) => {
    const formattedHost = formatDevServerHost(host);
    expect(formattedHost).toBe(expected);
    expect(new URL(`http://${formattedHost}:49152`).port).toBe("49152");
  });
});

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

async function isUrlReachable(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`);
    return true;
  } catch {
    return false;
  }
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

async function stopMeteorAndAssertPortsReleased(meteorProcess, ports) {
  const exitPromise = waitForProcessExit(meteorProcess);
  meteorProcess.kill("SIGTERM");
  await exitPromise;
  await Promise.all(
    ports.map((port) => waitForPortState(() => isPortAvailable(port))),
  );
}

describe("Regressions / PortCleanup /", () => {
  const port = 3146;
  const rspackPort = 18146;
  // origin/devel derives 8091 as 8077 + the digit sum of app port 3146.
  const oldDerivedRspackPort = 8091;
  const configuredRsdoctorPorts = [19100, 19200];
  const occupiedRsdoctorPort = 19300;
  let tempDir;
  let meteorProcess;
  let occupiedPortServer;
  let rsdoctorPorts;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorRspackApp({ appName: "react" }));
  });

  afterAll(async () => {
    await killMeteorProcess(meteorProcess);
    await closeServer(occupiedPortServer);
    await killStrayAppProcesses();
    await killProcessByPort([
      port,
      rspackPort,
      oldDerivedRspackPort,
      ...configuredRsdoctorPorts,
      occupiedRsdoctorPort,
      ...(rsdoctorPorts || []),
    ]);
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    meteorProcess = null;
    occupiedPortServer = null;
    rsdoctorPorts = [];
    await killProcessByPort([
      port,
      rspackPort,
      oldDerivedRspackPort,
      ...configuredRsdoctorPorts,
      occupiedRsdoctorPort,
    ]);
  });

  afterEach(async () => {
    await killMeteorProcess(meteorProcess);
    meteorProcess = null;
    await closeServer(occupiedPortServer);
    occupiedPortServer = null;
    await killStrayAppProcesses();
    await killProcessByPort([
      port,
      rspackPort,
      oldDerivedRspackPort,
      ...configuredRsdoctorPorts,
      occupiedRsdoctorPort,
      ...rsdoctorPorts,
    ]);
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

  // REGRESSION: Meteor guessed Rsdoctor ports, so cleanup could target the wrong process.
  test("reports Rsdoctor fallback ports and releases them", async () => {
    occupiedPortServer = await listenOnPort(occupiedRsdoctorPort);
    const result = await runMeteorApp(tempDir, port, {
      commandOptions: ["--extra-packages", "bundle-visualizer"],
      env: {
        CI: "",
        RSDOCTOR_CLIENT_PORT: String(occupiedRsdoctorPort),
        RSDOCTOR_SERVER_PORT: "",
      },
      waitForOutput: /=> Started Rsdoctor (client|server) analyzer at /,
      failOnOutput: /EADDRINUSE/,
      timeout: 30000,
    });

    meteorProcess = result.meteorProcess;
    await Promise.all([
      waitForMeteorOutput(
        result.outputLines,
        /=> Started Rsdoctor client analyzer at http:\/\/localhost:\d+\//,
        { meteorProcess, timeout: 30000 },
      ),
      waitForMeteorOutput(
        result.outputLines,
        /=> Started Rsdoctor server analyzer at http:\/\/localhost:\d+\//,
        { meteorProcess, timeout: 30000 },
      ),
    ]);

    rsdoctorPorts = result.outputLines.flatMap((line) => {
      const match = line.match(
        /=> Started Rsdoctor (?:client|server) analyzer at http:\/\/localhost:(\d+)\//,
      );
      return match ? [Number(match[1])] : [];
    });

    expect(rsdoctorPorts).toHaveLength(2);
    expect(new Set(rsdoctorPorts).size).toBe(2);
    expect(rsdoctorPorts).not.toContain(occupiedRsdoctorPort);
    await Promise.all(
      rsdoctorPorts.map((rsdoctorPort) =>
        waitForPortState(() => isUrlReachable(rsdoctorPort)),
      ),
    );
    await stopMeteorAndAssertPortsReleased(meteorProcess, rsdoctorPorts);
    meteorProcess = null;
  });

  test("preserves configured Rsdoctor ports", async () => {
    const [clientPort, serverPort] = configuredRsdoctorPorts;
    const result = await runMeteorApp(tempDir, port, {
      commandOptions: ["--extra-packages", "bundle-visualizer"],
      env: {
        CI: "",
        RSDOCTOR_CLIENT_PORT: String(clientPort),
        RSDOCTOR_SERVER_PORT: String(serverPort),
      },
      waitForOutput: /=> Started Rsdoctor (client|server) analyzer at /,
      failOnOutput: /EADDRINUSE/,
      timeout: 30000,
    });

    meteorProcess = result.meteorProcess;
    await Promise.all([
      waitForMeteorOutput(
        result.outputLines,
        `=> Started Rsdoctor client analyzer at http://localhost:${clientPort}/`,
        { meteorProcess, timeout: 30000 },
      ),
      waitForMeteorOutput(
        result.outputLines,
        `=> Started Rsdoctor server analyzer at http://localhost:${serverPort}/`,
        { meteorProcess, timeout: 30000 },
      ),
    ]);

    await Promise.all(
      configuredRsdoctorPorts.map((rsdoctorPort) =>
        waitForPortState(() => isUrlReachable(rsdoctorPort)),
      ),
    );
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
