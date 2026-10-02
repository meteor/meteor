const { EventEmitter } = require('node:events');

// Load the real runtime with Meteor's server lifecycle and proxy I/O mocked.
// Fake timers make restart bursts and the trailing summary deterministic.
function loadRuntime(flags = {}, { native = false, toolsCore = true, pathPrefix = '' } = {}) {
  const proxies = [];
  const createProxyServer = jest.fn(() => {
    const proxy = new EventEmitter();
    proxy.web = jest.fn();
    proxy.ws = jest.fn();
    proxies.push(proxy);
    return proxy;
  });
  const connectHandlers = { use: jest.fn() };
  const rawConnectHandlers = { use: jest.fn() };
  const httpServer = new EventEmitter();
  const registerBoilerplateDataCallback = jest.fn();

  global.Package = toolsCore ? { 'tools-core': {} } : {};
  global.__meteor_runtime_config__ = { ROOT_URL_PATH_PREFIX: pathPrefix };
  process.env.RSPACK_DEVSERVER_PORT = '3210';
  if (native) process.env.RSPACK_NATIVE = '1';
  else delete process.env.RSPACK_NATIVE;

  jest.doMock('meteor/meteor', () => ({
    Meteor: {
      isDevelopment: true, isTest: false, isAppTest: false,
      startup: jest.fn(), ...flags,
    },
  }), { virtual: true });
  jest.doMock('meteor/webapp', () => ({
    WebApp: {
      connectHandlers, httpServer, rawConnectHandlers,
    },
    WebAppInternals: { staticFilesMiddleware: jest.fn(), registerBoilerplateDataCallback },
  }), { virtual: true });
  jest.doMock('meteor/tools-core/lib/string', () => ({
    shuffleString: value => value,
  }), { virtual: true });
  jest.doMock('http-proxy-3', () => ({ createProxyServer }), { virtual: true });
  jest.doMock('../../../packages/rspack/lib/constants', () => ({
    getRspackChunksContext: () => 'build-chunks',
    getRspackAssetsContext: () => 'build-assets',
    RSPACK_HOT_UPDATE_REGEX: /([^/]+\.hot-update\.(?:js|json))$/,
  }));

  require('../../../packages/rspack/rspack_server');
  return { proxies, createProxyServer, connectHandlers, rawConnectHandlers, httpServer, registerBoilerplateDataCallback };
}

function fail(proxy, code = 'ECONNREFUSED', url = '/client-rspack.js', response) {
  const destination = response || { destroy: jest.fn() };
  proxy.emit('error', { code }, { method: 'GET', url }, destination);
  return destination;
}

describe('Rspack development proxy error diagnostics', () => {
  let originalPackage;
  let originalRuntimeConfig;
  let originalEnv;
  let errorLog;

  beforeEach(() => {
    originalPackage = global.Package;
    originalRuntimeConfig = global.__meteor_runtime_config__;
    originalEnv = process.env;
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.useFakeTimers();
    errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = originalEnv;
    if (originalPackage === undefined) delete global.Package;
    else global.Package = originalPackage;
    if (originalRuntimeConfig === undefined) delete global.__meteor_runtime_config__;
    else global.__meteor_runtime_config__ = originalRuntimeConfig;
  });

  test('routes prefixed HMR upgrades once, preserves queries, and leaves DDP alone', () => {
    const { proxies: [assets, ws], httpServer } = loadRuntime({}, { pathPrefix: '/live' });
    const upstreamUrls = [];
    ws.ws.mockImplementation(req => upstreamUrls.push(req.url));
    const request = { url: '/live/ws?token=example' };

    httpServer.emit('upgrade', request, {}, Buffer.alloc(0));
    expect(upstreamUrls).toEqual(['/ws?token=example']);
    expect(request.url).toBe('/live/ws?token=example');
    expect(assets.ws).not.toHaveBeenCalled();

    httpServer.emit('upgrade', { url: '/live/sockjs/websocket' }, {}, Buffer.alloc(0));
    httpServer.emit('upgrade', { url: '/lively/ws' }, {}, Buffer.alloc(0));
    expect(ws.ws).toHaveBeenCalledTimes(1);
    expect(assets.ws).not.toHaveBeenCalled();
  });

  test('prefixes architecture assets without sending their disk output to the dev server', () => {
    const { registerBoilerplateDataCallback } = loadRuntime({}, { pathPrefix: '/live' });
    const rewrite = registerBoilerplateDataCallback.mock.calls[0][1];
    const data = {
      head: '<link href="/build-chunks/main.css"><link href="/build-chunks/web.browser.legacy/main.css"><script src="/build-assets/web.cordova/runtime.js"></script>',
    };
    expect(rewrite({}, data)).toBe(true);
    expect(data.head).toBe('<link href="/live/__rspack__/build-chunks/main.css"><link href="/live/build-chunks/web.browser.legacy/main.css"><script src="/live/build-assets/web.cordova/runtime.js"></script>');
    expect(rewrite({}, data)).toBe(false);
  });

  test('keeps query strings in compatibility redirects and serves explicit architectures from disk', () => {
    const { rawConnectHandlers } = loadRuntime({}, { pathPrefix: '/live' });
    const redirect = rawConnectHandlers.use.mock.calls[0][0];
    const response = { writeHead: jest.fn(), end: jest.fn() };
    const next = jest.fn();
    redirect({ url: '/build-chunks/main.css?cache=1' }, response, next);
    expect(response.writeHead).toHaveBeenCalledWith(307, {
      Location: '/live/__rspack__/build-chunks/main.css?cache=1',
    });
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    redirect({ url: '/build-chunks/web.browser.legacy/main.css?cache=1' }, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.writeHead).toHaveBeenCalledTimes(1);
  });

  test.each(['js', 'json'])('does not redirect a prefixed hot-update.%s request back to itself', extension => {
    const { rawConnectHandlers } = loadRuntime({}, { pathPrefix: '/live' });
    const redirect = rawConnectHandlers.use.mock.calls[0][0];
    const response = { writeHead: jest.fn(), end: jest.fn() };
    const next = jest.fn();

    redirect({ url: `/live/__rspack__/main.hash.hot-update.${extension}?cache=1` }, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.writeHead).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
  });

  test('logs the first failure immediately and summarizes a burst across asset URLs', () => {
    const { proxies: [assets] } = loadRuntime();
    fail(assets);
    expect(errorLog).toHaveBeenCalledWith(
      '[rspack-proxy:assets] upstream error ECONNREFUSED for GET /client-rspack.js -> http://localhost:3210'
    );

    for (let i = 0; i < 100; i++) fail(assets, 'ECONNREFUSED', `/chunk-${i}.js`);
    jest.advanceTimersByTime(4999);
    expect(errorLog).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(errorLog).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenLastCalledWith(
      '[rspack-proxy:assets] upstream error ECONNREFUSED: suppressed 100 additional failures in the last 5s -> http://localhost:3210'
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  test('keeps different error codes and proxy scopes visible immediately', () => {
    const { proxies: [assets, ws] } = loadRuntime();
    fail(assets);
    fail(assets);
    fail(assets, 'ECONNRESET');
    fail(ws);
    fail(ws);
    expect(errorLog).toHaveBeenCalledTimes(3);
    expect(errorLog).toHaveBeenNthCalledWith(2, expect.stringContaining('assets] upstream error ECONNRESET'));
    expect(errorLog).toHaveBeenNthCalledWith(3, expect.stringContaining('ws] upstream error ECONNREFUSED'));

    jest.advanceTimersByTime(5000);
    expect(errorLog).toHaveBeenCalledTimes(5);
    expect(errorLog).toHaveBeenNthCalledWith(4, expect.stringContaining('assets] upstream error ECONNREFUSED: suppressed 1 additional failure '));
    expect(errorLog).toHaveBeenNthCalledWith(5, expect.stringContaining('ws] upstream error ECONNREFUSED: suppressed 1 additional failure '));
  });

  test('deduplicates errors without a code by message while preserving different messages', () => {
    const { proxies: [assets] } = loadRuntime();
    const request = { method: 'GET', url: '/client-rspack.js' };
    for (const message of ['upstream ended', 'upstream ended', 'proxy timeout']) {
      assets.emit('error', new Error(message), request, { destroy: jest.fn() });
    }
    expect(errorLog).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenLastCalledWith(expect.stringContaining('upstream error proxy timeout for GET'));
    jest.advanceTimersByTime(5000);
    expect(errorLog).toHaveBeenLastCalledWith(expect.stringContaining('upstream ended: suppressed 1 additional failure '));
  });

  test('bounds output during a continuing outage and reports a later failure again', () => {
    const { proxies: [assets] } = loadRuntime();
    for (let window = 0; window < 3; window++) {
      for (let i = 0; i < 10; i++) {
        fail(assets);
        jest.advanceTimersByTime(500);
      }
      expect(errorLog).toHaveBeenCalledTimes((window + 1) * 2);
      expect(errorLog).toHaveBeenLastCalledWith(expect.stringContaining('suppressed 9 additional failures'));
    }
    jest.advanceTimersByTime(30000);
    expect(errorLog).toHaveBeenCalledTimes(6);
    fail(assets);
    expect(errorLog).toHaveBeenCalledTimes(7);
    expect(errorLog).toHaveBeenLastCalledWith(expect.stringContaining('for GET /client-rspack.js'));
    jest.advanceTimersByTime(5000);
    expect(errorLog).toHaveBeenCalledTimes(7);
  });

  test('still responds to every failed HTTP request and closes every failed socket', () => {
    const { proxies: [assets] } = loadRuntime();
    for (const headersSent of [false, false, true]) {
      const response = { headersSent, writeHead: jest.fn(), end: jest.fn() };
      fail(assets, 'ECONNREFUSED', '/client-rspack.js', response);
      if (headersSent) expect(response.writeHead).not.toHaveBeenCalled();
      else expect(response.writeHead).toHaveBeenCalledWith(502, { 'Content-Type': 'text/plain' });
      expect(response.end).toHaveBeenCalledWith('Rspack dev server proxy error.');
    }
    for (let i = 0; i < 3; i++) {
      expect(fail(assets).destroy).toHaveBeenCalledTimes(1);
    }
    expect(errorLog).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    expect(errorLog).toHaveBeenLastCalledWith(expect.stringContaining('suppressed 5 additional failures'));
  });

  test('successful proxy traffic and clean WebSocket closures stay quiet', () => {
    const { proxies: [assets, ws] } = loadRuntime();
    assets.emit('proxyRes', { statusCode: 200 });
    ws.emit('open', {});
    ws.emit('close', {});
    jest.advanceTimersByTime(10000);
    expect(errorLog).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('the summary timer does not keep the process alive', () => {
    const timer = jest.spyOn(global, 'setTimeout');
    const { proxies: [assets] } = loadRuntime();
    fail(assets);
    expect(timer.mock.results.at(-1).value.hasRef()).toBe(false);
  });

  test.each([
    ['production', { isDevelopment: false }, {}],
    ['meteor test', { isTest: true }, {}],
    ['meteor test --full-app', { isAppTest: true }, {}],
    ['native Rspack', {}, { native: true }],
    ['missing tools-core', {}, { toolsCore: false }],
  ])('does not enable proxy logging in %s', (_name, flags, options) => {
    const { createProxyServer, connectHandlers, httpServer } = loadRuntime(flags, options);
    expect(createProxyServer).not.toHaveBeenCalled();
    expect(connectHandlers.use).not.toHaveBeenCalled();
    expect(httpServer.listenerCount('upgrade')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    expect(errorLog).not.toHaveBeenCalled();
  });
});
