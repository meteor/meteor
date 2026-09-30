import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
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
const ES_MODULE_APP_PORTS = [3132, 18132];
const DEBUGGING_PORTS = [3133, 18133, 9233];
const ASSETS_GLOBAL_PORTS = [3134, 18134];

async function getInspectorWebSocketUrl(port, timeout = 90000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find(entry => entry.webSocketDebuggerUrl);
        if (target) {
          return target.webSocketDebuggerUrl;
        }
      }
    } catch {
      // The inspector endpoint is unavailable until the server child starts.
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Node Inspector did not start on port ${port}`);
}

async function connectInspector(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pendingCommands = new Map();
  const queuedEvents = new Map();
  const eventWaiters = [];
  let nextCommandId = 1;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out connecting to Node Inspector')),
      15000
    );

    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Failed to connect to Node Inspector'));
    }, { once: true });
  });

  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);

    if (message.id) {
      const pending = pendingCommands.get(message.id);
      if (!pending) return;
      pendingCommands.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }

    if (!message.method) return;
    const waiterIndex = eventWaiters.findIndex(
      waiter =>
        waiter.method === message.method && waiter.predicate(message.params)
    );
    if (waiterIndex !== -1) {
      const [waiter] = eventWaiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message.params);
      return;
    }

    const queue = queuedEvents.get(message.method) || [];
    queue.push(message.params);
    queuedEvents.set(message.method, queue);
  });

  function send(method, params = {}, timeout = 15000) {
    const id = nextCommandId++;
    return new Promise((resolve, reject) => {
      const commandTimeout = setTimeout(() => {
        pendingCommands.delete(id);
        reject(new Error(`Timed out sending Inspector command ${method}`));
      }, timeout);
      pendingCommands.set(id, {
        resolve,
        reject,
        timeout: commandTimeout,
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function waitForEvent(method, predicate = () => true, timeout = 15000) {
    const queue = queuedEvents.get(method) || [];
    const eventIndex = queue.findIndex(predicate);
    if (eventIndex !== -1) {
      const [event] = queue.splice(eventIndex, 1);
      return Promise.resolve(event);
    }

    return new Promise((resolve, reject) => {
      const eventTimeout = setTimeout(() => {
        const waiterIndex = eventWaiters.findIndex(
          waiter => waiter.resolve === resolve
        );
        if (waiterIndex !== -1) {
          eventWaiters.splice(waiterIndex, 1);
        }
        reject(new Error(`Timed out waiting for Inspector event ${method}`));
      }, timeout);
      eventWaiters.push({
        method,
        predicate,
        resolve,
        reject,
        timeout: eventTimeout,
      });
    });
  }

  function close() {
    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close();
    }
  }

  return { close, send, waitForEvent };
}

function resolveInspectorSourceMapPath(script) {
  const scriptPath = script.url.startsWith('file://')
    ? fileURLToPath(script.url)
    : script.url;

  if (script.sourceMapURL.startsWith('file://')) {
    return fileURLToPath(script.sourceMapURL);
  }

  return path.resolve(path.dirname(scriptPath), script.sourceMapURL);
}

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

describe('Regressions / Server Runtime /', () => {
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
        /=> App running at|Cannot find module .*server-rspack\.cjs/,
        {
          timeout: 90000,
          meteorProcess,
        }
      );
      expect(startupResult).toContain('=> App running at');

      expect(
        await fs.pathExists(
          path.join(tempDir, buildDir, 'main-dev', 'server-rspack.cjs')
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

  test('exposes the Assets and Npm globals to server bundle code', async () => {
    let tempDir;
    let meteorProcess;

    try {
      tempDir = await prepareServerOnlyApp(ASSETS_GLOBAL_PORTS);

      await fs.outputFile(
        path.join(tempDir, 'private', 'assets-fixture.txt'),
        'assets fixture content'
      );
      await fs.writeFile(
        path.join(tempDir, 'server', 'main.js'),
        `const nodePath = Npm.require('path');

const absolutePath = Assets.absoluteFilePath('assets-fixture.txt');

Assets.getTextAsync('assets-fixture.txt')
  .then(text => {
    console.log(
      \`assets fixture read: \${text} from \${nodePath.basename(absolutePath)}\`
    );
  })
  .catch(error => {
    console.error(\`assets fixture failed: \${error.message}\`);
  });
`
      );

      const result = await runMeteorCommand(
        'run',
        ['--port', String(ASSETS_GLOBAL_PORTS[0])],
        tempDir,
        {
          captureOutput: true,
          env: {
            RSPACK_DEVSERVER_PORT: String(ASSETS_GLOBAL_PORTS[1]),
          },
        }
      );
      meteorProcess = result.meteorProcess;

      const assetsResult = await waitForMeteorOutput(
        result.outputLines,
        /assets fixture (?:read|failed)|(?:Assets|Npm) is not defined|Your application is crashing/,
        { timeout: 90000, meteorProcess }
      );
      expect(assetsResult).toContain(
        'assets fixture read: assets fixture content from assets-fixture.txt'
      );
    } finally {
      await cleanupRegressionApp({
        tempDir,
        meteorProcess,
        ports: ASSETS_GLOBAL_PORTS,
      });
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

  test('loads the CommonJS server bundle from an ES module app', async () => {
    const meteorLocalDir = path.join(
      os.tmpdir(),
      `meteor-e2e-esm-local-${process.pid}-${Date.now()}`
    );
    const buildDir = `_build-${path.basename(meteorLocalDir)}`;
    let tempDir;
    let meteorProcess;

    try {
      await fs.remove(meteorLocalDir);
      tempDir = await prepareServerOnlyApp(ES_MODULE_APP_PORTS);

      const packageJsonPath = path.join(tempDir, 'package.json');
      const packageJson = await fs.readJson(packageJsonPath);
      await fs.writeJson(
        packageJsonPath,
        { ...packageJson, type: 'module' },
        { spaces: 2 }
      );
      // The fixture config is CommonJS, so give it an explicit extension
      // before placing it under an ES module package scope.
      await fs.move(
        path.join(tempDir, 'rspack.config.js'),
        path.join(tempDir, 'rspack.config.cjs')
      );

      const result = await runMeteorCommand(
        'run',
        ['--port', String(ES_MODULE_APP_PORTS[0])],
        tempDir,
        {
          captureOutput: true,
          env: {
            // Keep Meteor's generated launcher outside the application package
            // scope while the Rspack server output remains inside it.
            METEOR_LOCAL_DIR: meteorLocalDir,
            RSPACK_DEVSERVER_PORT: String(ES_MODULE_APP_PORTS[1]),
          },
        }
      );
      meteorProcess = result.meteorProcess;

      const startupResult = await waitForMeteorOutput(
        result.outputLines,
        /=> App running at|ERR_REQUIRE_ESM|ES module scope/,
        { timeout: 90000, meteorProcess }
      );
      expect(startupResult).toContain('=> App running at');

      expect(
        await fs.pathExists(
          path.join(tempDir, buildDir, 'main-dev', 'server-rspack.cjs')
        )
      ).toBe(true);
    } finally {
      await cleanupRegressionApp({
        tempDir,
        meteorProcess,
        ports: ES_MODULE_APP_PORTS,
      });
      await fs.remove(meteorLocalDir);
    }
  });

  test('preserves Node Inspector debugging foundations', async () => {
    const inspectorPort = DEBUGGING_PORTS[2];
    const breakpointMarker = 'rspack debugger breakpoint marker';
    let tempDir;
    let meteorProcess;
    let inspector;

    try {
      tempDir = await prepareServerOnlyApp(DEBUGGING_PORTS);
      await fs.writeFile(
        path.join(tempDir, 'server', 'main.js'),
        `debugger;
console.log('${breakpointMarker}');
console.log(new Error('rspack debugger source-map marker').stack);
`
      );

      const result = await runMeteorCommand(
        'run',
        [
          `--inspect-brk=${inspectorPort}`,
          '--port',
          String(DEBUGGING_PORTS[0]),
        ],
        tempDir,
        {
          captureOutput: true,
          env: {
            RSPACK_DEVSERVER_PORT: String(DEBUGGING_PORTS[1]),
          },
        }
      );
      meteorProcess = result.meteorProcess;

      const webSocketUrl = await getInspectorWebSocketUrl(inspectorPort);
      inspector = await connectInspector(webSocketUrl);
      await inspector.send('Debugger.enable');

      const meteorPause = await inspector.waitForEvent('Debugger.paused');
      expect(meteorPause.callFrames.length).toBeGreaterThan(0);

      const appPausePromise = inspector.waitForEvent(
        'Debugger.paused',
        undefined,
        30000
      );
      // Meteor recognizes an attached debugger when its startup pause lasts
      // longer than the 50 ms threshold in server/boot.js.
      await new Promise(resolve => setTimeout(resolve, 100));
      await inspector.send('Debugger.resume');
      const appPause = await appPausePromise;
      const appFrame = appPause.callFrames[0];
      const scriptId = appFrame.location.scriptId;
      const script = await inspector.waitForEvent(
        'Debugger.scriptParsed',
        event => event.scriptId === scriptId
      );

      expect(script.url).toMatch(/server-rspack\.cjs$/);
      expect(script.sourceMapURL).toBeTruthy();
      const sourceMap = await fs.readJson(resolveInspectorSourceMapPath(script));
      expect(
        sourceMap.sources.some(source =>
          source.replace(/\\/g, '/').includes('server/main.js')
        )
      ).toBe(true);

      const { scriptSource } = await inspector.send(
        'Debugger.getScriptSource',
        { scriptId }
      );
      const markerIndex = scriptSource.indexOf(breakpointMarker);
      expect(markerIndex).toBeGreaterThan(-1);
      const markerLine = scriptSource.slice(0, markerIndex).split('\n').length - 1;
      const { breakpointId } = await inspector.send(
        'Debugger.setBreakpoint',
        {
          location: {
            scriptId,
            lineNumber: markerLine,
            columnNumber: 0,
          },
        }
      );

      const breakpointPausePromise = inspector.waitForEvent(
        'Debugger.paused',
        event => (event.hitBreakpoints || []).includes(breakpointId)
      );
      await inspector.send('Debugger.resume');
      await breakpointPausePromise;
      await inspector.send('Debugger.resume');

      const stackResult = await waitForMeteorOutput(
        result.outputLines,
        /server[\\/]main\.js:\d+:\d+/,
        { timeout: 15000, meteorProcess }
      );
      expect(stackResult).toMatch(/server[\\/]main\.js:\d+:\d+/);

      const startupResult = await waitForMeteorOutput(
        result.outputLines,
        '=> App running at',
        { timeout: 30000, meteorProcess }
      );
      expect(startupResult).toContain('=> App running at');
    } finally {
      if (inspector) {
        try {
          await inspector.send('Debugger.resume');
        } catch {
          // The server is already running or the Inspector has disconnected.
        }
        inspector.close();
      }
      await cleanupRegressionApp({
        tempDir,
        meteorProcess,
        ports: DEBUGGING_PORTS,
      });
    }
  });
});
