import { Meteor } from 'meteor/meteor';
import { WebApp, WebAppInternals } from 'meteor/webapp';
import path from 'path';
import fs from 'fs/promises';
import {
  getRspackChunksContext,
  getRspackAssetsContext,
  RSPACK_HOT_UPDATE_REGEX,
} from "./lib/constants";

// The chunk/asset contexts are mode-scoped (see getRspackChunksContext) so a
// dev server and a `meteor test` instance running on the same app directory
// serve from — and clean — separate directories. The suffix must match the one
// the build side used (packages/rspack/lib/processes.js): `meteor test` sets
// Meteor.isTest and `meteor test --full-app` sets Meteor.isAppTest, mirroring
// isMeteorAppTest()/isMeteorAppTestFullApp() in the build tool.
const isTestMode = Meteor.isTest || Meteor.isAppTest;
const isTestFullApp = Meteor.isAppTest;
const rspackChunksContext = getRspackChunksContext(isTestMode, isTestFullApp);
const rspackAssetsContext = getRspackAssetsContext(isTestMode, isTestFullApp);

/**
 * Regex pattern for rspack bundles
 * @constant {RegExp}
 */
const RSPACK_CHUNKS_REGEX = new RegExp(
  `^/${rspackChunksContext}/(.+)$`,
);

/**
 * Regex pattern for rspack assets
 * @constant {RegExp}
 */
const RSPACK_ASSETS_REGEX = new RegExp(
  `^/${rspackAssetsContext}/(.+)$`,
);

const shouldEnableDevHMRProxy =
  global?.Package?.["tools-core"] != null &&
  Meteor.isDevelopment &&
  !Meteor.isTest && !Meteor.isAppTest &&
  !process.env.RSPACK_NATIVE;
if (shouldEnableDevHMRProxy) {
  const { shuffleString } = require('meteor/tools-core/lib/string');
  // http-proxy-3 is a maintained, drop-in replacement for the unmaintained
  // http-proxy that http-proxy-middleware pulls in. The old http-proxy uses the
  // deprecated `util._extend` and legacy `url.parse` APIs, which print Node
  // deprecation warnings on every proxied request. See
  // https://github.com/meteor/meteor/issues/13491.
  const httpProxy = require('http-proxy-3');

  // Target URL for the Rspack dev server
  const target = `http://localhost:${process.env.RSPACK_DEVSERVER_PORT}`;

  const createRspackProxy = (scope) => {
    const proxy = httpProxy.createProxyServer({});
    const recentErrors = new Map();

    // Log the first failure immediately, then summarize repeats after 5s.
    // Group by error code within this proxy's scope/target, not request URL:
    // a dev-server restart can fail many different assets and HMR reconnects.
    const logProxyError = (err, req) => {
      const error = err.code || err.message;
      const previous = recentErrors.get(error);
      if (previous) {
        previous.repeats++;
        return;
      }

      console.error(
        `[rspack-proxy:${scope}] upstream error ${error} for ${req.method} ${req.url} -> ${target}`
      );

      const entry = { repeats: 0 };
      recentErrors.set(error, entry);
      setTimeout(() => {
        recentErrors.delete(error);
        if (entry.repeats > 0) {
          console.error(
            `[rspack-proxy:${scope}] upstream error ${error}: suppressed ${entry.repeats} additional ${entry.repeats === 1 ? 'failure' : 'failures'} in the last 5s -> ${target}`
          );
        }
      }, 5000).unref();
    };

    proxy.on('error', (err, req, resOrSocket) => {
      logProxyError(err, req);

      // Don't let a transient dev-server hiccup (e.g. during a restart) crash
      // the app process; respond with a 502 / close the socket instead.
      if (resOrSocket && typeof resOrSocket.writeHead === 'function') {
        if (!resOrSocket.headersSent) {
          resOrSocket.writeHead(502, { 'Content-Type': 'text/plain' });
        }
        resOrSocket.end('Rspack dev server proxy error.');
      } else if (resOrSocket && typeof resOrSocket.destroy === 'function') {
        resOrSocket.destroy();
      }
    });

    return proxy;
  };
  const assetsProxy = createRspackProxy('assets');
  const wsProxy = createRspackProxy('ws');

  // Proxy all dev asset requests under the rspack prefix. connect strips the
  // mount prefix from req.url before calling the handler, so this proxies
  // "/__rspack__/foo" -> "<devserver>/foo", matching the previous
  // http-proxy-middleware behavior. This also supports integrations whose
  // output.publicPath does not include /__rspack__/.
  WebApp.connectHandlers.use('/__rspack__', (req, res) => {
    assetsProxy.web(req, res, { target, changeOrigin: true });
  });
  WebApp.connectHandlers.use('/ws', (req, res) => {
    wsProxy.web(req, res, { target });
  });

  // Proxy HMR WebSocket upgrades. Scope to Rspack's own paths so Meteor's
  // DDP/sockjs websockets are left untouched.
  WebApp.httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (url.startsWith('/__rspack__')) {
      assetsProxy.ws(req, socket, head, { target, changeOrigin: true });
    } else if (url === '/ws' || url.startsWith('/ws?') || url.startsWith('/ws/')) {
      wsProxy.ws(req, socket, head, { target });
    }
  });

  WebApp.rawConnectHandlers.use((req, res, next) => {
    // If this request is already under /__rspack__/, don't redirect it again.
    if (req.url.startsWith('/__rspack__/')) {
      return next();
    }

    // 1) match ANY URL whose last segment ends with ".hot-update.js" or ".hot-update.json",
    //    e.g. "/main.ce385971e9f19307.hot-update.js"
    //         "/ui_pages_tasks_tasks-page_jsx.ce385971e9f19307.hot-update.js"
    //         "/foo/bar/baz.1234abcd.hot-update.json"
    const hotUpdate = req.url.match(RSPACK_HOT_UPDATE_REGEX);
    if (hotUpdate) {
      // Redirect "/something.hot-update.js" → "/__rspack__/something.hot-update.js"
      const target = `/__rspack__/${hotUpdate[1]}`;
      res.writeHead(307, { Location: target });
      return res.end();
    }

    // 2) match "/build-chunks/<anything>"
    const bundlesMatch = req.url.match(RSPACK_CHUNKS_REGEX);
    const assetsMatch = req.url.match(RSPACK_ASSETS_REGEX);
    // Explicit architecture builds are written to disk and served by Meteor.
    // Only the default client's in-memory output belongs to the HMR server.
    if (/^web\.(?:browser(?:\.legacy)?|cordova)\//.test(
      (bundlesMatch || assetsMatch)?.[1] || ''
    )) {
      return next();
    }
    if (bundlesMatch) {
      // Redirect "/bundles/foo.js" → "/__rspack__/build-chunks/foo.js"
      const target = `/__rspack__/${rspackChunksContext}/${bundlesMatch[1]}`;
      res.writeHead(307, { Location: target });
      return res.end();
    }

    // 3) match "/build-assets/<anything>"
    if (assetsMatch) {
      // Redirect "/build-assets/foo.js" → "/__rspack__/build-assets/foo.js"
      const target = `/__rspack__/${rspackAssetsContext}/${assetsMatch[1]}`;
      res.writeHead(307, { Location: target });
      return res.end();
    }

    // Otherwise, let it pass through
    next();
  });

  /**
   * Force client to reload after Rspack server compilation and restart, which doesn’t happen automatically.
   * On each server reload, generate a new client hash once to force Meteor’s client reload.
   * After the first reload, apply Meteor's default behavior.
   */
  function enableClientReloadOnServerStart() {
    Meteor.startup(() => {
      const originalCalc = WebApp.calculateClientHashReplaceable;
      const cachedHash = {};
      const prevRealHash = {};
      WebApp.calculateClientHashReplaceable = function (...args) {
        const arch = args[0];
        const realHash = originalCalc.apply(this, args);
        if (prevRealHash[arch] && realHash !== prevRealHash[arch]) {
          prevRealHash[arch] = realHash;
          return realHash;
        }
        prevRealHash[arch] = realHash;
        if (cachedHash[arch] == null) {
          cachedHash[arch] = shuffleString(realHash);
        }
        return cachedHash[arch];
      };
    });
  }

  // Enable client reload on server startup
  enableClientReloadOnServerStart();
}

/**
 * Create request-local metadata for Meteor's static file middleware.
 * @param {string} pathname - The pathname of the asset
 * @param {string} filePath - The absolute path to the asset on disk
 * @returns {Object} The static file info object
 */
function rspackStaticAssetInfo(pathname, filePath) {
  // Determine file type based on extension
  const type = pathname.endsWith(".js") ? "js" :
    pathname.endsWith(".css") ? "css" :
      pathname.endsWith(".json") ? "json" : undefined;

  // Extract hash from filename (assuming it's the second part after splitting by '.')
  const filename = pathname.split("/").pop();
  const hash = filename.split(".")[1];

  return {
    absolutePath: filePath,
    cacheable: true, // Most rspack assets are cacheable
    hash,
    type
  };
}

function rspackAssetNotFound(res) {
  res.writeHead(404, { 'Cache-Control': 'no-store' });
  res.end();
}

// Store the original staticFilesMiddleware
const originalStaticFilesMiddleware = WebAppInternals.staticFilesMiddleware;

// Handle rspack assets on-demand to add Meteor's static files headers
WebAppInternals.staticFilesMiddleware = async function(staticFilesByArch, req, res, next) {
  try {
    const request = WebApp.categorizeRequest(req);
    let pathname;
    try {
      // Use the same path as WebApp, including architecture-prefix handling.
      pathname = decodeURIComponent(request.path);
    } catch {
      if (RSPACK_CHUNKS_REGEX.test(request.path) || RSPACK_ASSETS_REGEX.test(request.path)) {
        return rspackAssetNotFound(res);
      }
      return await originalStaticFilesMiddleware(staticFilesByArch, req, res, next);
    }

    // Check if this is a rspack asset request
    const chunksMatch = pathname.match(RSPACK_CHUNKS_REGEX);
    const assetsMatch = pathname.match(RSPACK_ASSETS_REGEX);

    if (chunksMatch || assetsMatch) {
      const context = chunksMatch ? rspackChunksContext : rspackAssetsContext;
      const filename = (chunksMatch ? chunksMatch[1] : assetsMatch[1]);
      const root = path.resolve(process.cwd(), context);
      let filePath = path.join(root, filename);
      const relativePath = path.relative(root, filePath);

      // Decode before resolving, and keep URL paths inside the selected output
      // directory on every platform. Backslashes are not URL separators.
      if (filename.includes('\\') || filename.includes('\0') ||
          relativePath === '..' || relativePath.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relativePath)) {
        return rspackAssetNotFound(res);
      }

      // Built bundles already have manifest entries pointing into the client
      // program, while development output may live directly under cwd.
      const canonicalPath = path.posix.normalize(pathname);
      const architectures = [request.arch, ...Object.keys(staticFilesByArch)
        .filter(arch => arch !== request.arch)];
      let info;
      for (const arch of architectures) {
        info = staticFilesByArch[arch]?.[canonicalPath];
        if (info) break;
      }
      if (typeof info === 'function') info = info();
      if (info?.absolutePath) filePath = info.absolutePath;

      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
          return rspackAssetNotFound(res);
        }
        throw error;
      }
      if (!stat.isFile()) {
        return rspackAssetNotFound(res);
      }

      // Never put request-derived keys in the shared manifests: even aliases
      // of an existing file could otherwise grow them indefinitely. WebApp's
      // middleware only needs this file to serve this request with its usual
      // cache, content type, conditional request, and range handling.
      const requestStaticFiles = {
        [request.arch]: {
          [request.path]: {
            ...rspackStaticAssetInfo(canonicalPath, filePath),
            ...info,
            cacheable: true,
          },
        },
      };
      return await originalStaticFilesMiddleware(requestStaticFiles, req, res, next);
    }

    return await originalStaticFilesMiddleware(staticFilesByArch, req, res, next);
  } catch (error) {
    return next(error);
  }
};
