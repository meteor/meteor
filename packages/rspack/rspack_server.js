import { Meteor } from 'meteor/meteor';
import { WebApp, WebAppInternals } from 'meteor/webapp';
import path from 'path';
import { parse as parseUrl } from 'url';
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

// ROOT_URL path prefix (e.g. "/live" for ROOT_URL=https://example.com/live/).
// Every URL the integration constructs must carry it, consistent with every
// other URL Meteor emits. See meteor/meteor#14523.
const configuredRootUrlPathPrefix =
  (typeof __meteor_runtime_config__ !== 'undefined' &&
    __meteor_runtime_config__.ROOT_URL_PATH_PREFIX) ||
  '';
const rootUrlPathPrefix = configuredRootUrlPathPrefix === '/'
  ? ''
  : configuredRootUrlPathPrefix.replace(/\/+$/, '');

/**
 * Escape a string for literal use inside a RegExp
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex pattern for rspack bundles
 * @constant {RegExp}
 */
const RSPACK_CHUNKS_REGEX = new RegExp(
  `^\/${rspackChunksContext}\/(.+)$`,
);

/**
 * Regex pattern for rspack assets
 * @constant {RegExp}
 */
const RSPACK_ASSETS_REGEX = new RegExp(
  `^\/${rspackAssetsContext}\/(.+)$`,
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
    const originalUrl = req.url;
    let url = originalUrl || '';
    // Upgrade requests bypass Connect's ROOT_URL prefix stripping.
    if (rootUrlPathPrefix && url.startsWith(`${rootUrlPathPrefix}/`)) {
      url = url.slice(rootUrlPathPrefix.length);
    }
    req.url = url;
    try {
      if (url.startsWith('/__rspack__')) {
        assetsProxy.ws(req, socket, head, { target, changeOrigin: true });
      } else if (url === '/ws' || url.startsWith('/ws?') || url.startsWith('/ws/')) {
        wsProxy.ws(req, socket, head, { target });
      }
    } finally {
      req.url = originalUrl;
    }
  });

  WebApp.rawConnectHandlers.use((req, res, next) => {
    const parsedRequestUrl = parseUrl(req.url);
    const pathname = parsedRequestUrl.pathname;
    const search = parsedRequestUrl.search || '';

    // If this request is already under /__rspack__/, don't redirect it again.
    if (pathname.startsWith('/__rspack__/')) {
      return next();
    }

    // 1) match ANY URL whose last segment ends with ".hot-update.js" or ".hot-update.json",
    //    e.g. "/main.ce385971e9f19307.hot-update.js"
    //         "/ui_pages_tasks_tasks-page_jsx.ce385971e9f19307.hot-update.js"
    //         "/foo/bar/baz.1234abcd.hot-update.json"
    const hotUpdate = pathname.match(RSPACK_HOT_UPDATE_REGEX);
    if (hotUpdate) {
      // Redirect "/something.hot-update.js" → "/__rspack__/something.hot-update.js"
      // (with the ROOT_URL path prefix applied, so the redirected request
      // reaches the proxy mounted under the prefix — see meteor/meteor#14523)
      const target = `${rootUrlPathPrefix}/__rspack__/${hotUpdate[1]}${search}`;
      res.writeHead(307, { Location: target });
      return res.end();
    }

    // 2) match "/build-chunks/<anything>"
    const bundlesMatch = pathname.match(RSPACK_CHUNKS_REGEX);
    const assetsMatch = pathname.match(RSPACK_ASSETS_REGEX);
    // Explicit architecture builds are written to disk and served by Meteor.
    // Only the default client's in-memory output belongs to the HMR server.
    if (/^web\.(?:browser(?:\.legacy)?|cordova)\//.test(
      (bundlesMatch || assetsMatch)?.[1] || ''
    )) {
      return next();
    }
    if (bundlesMatch) {
      // Redirect "/bundles/foo.js" → "/__rspack__/build-chunks/foo.js"
      const target = `${rootUrlPathPrefix}/__rspack__/${rspackChunksContext}/${bundlesMatch[1]}${search}`;
      res.writeHead(307, { Location: target });
      return res.end();
    }

    // 3) match "/build-assets/<anything>"
    if (assetsMatch) {
      // Redirect "/build-assets/foo.js" → "/__rspack__/build-assets/foo.js"
      const target = `${rootUrlPathPrefix}/__rspack__/${rspackAssetsContext}/${assetsMatch[1]}${search}`;
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
      let hasShuffled = false;
      let cachedHash = {};
      let prevRealHash = {};
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
          hasShuffled = true;
        }
        return cachedHash[arch];
      };
    });
  }

  // Enable client reload on server startup
  enableClientReloadOnServerStart();
}

/**
 * Register a single rspack static asset with WebAppInternals.staticFilesByArch
 * @param {string} arch - The architecture to register the asset for
 * @param {string} pathname - The pathname of the asset
 * @param {string} filePath - The absolute path to the asset on disk
 * @returns {Object} The static file info object
 */
function registerRspackStaticAsset(arch, pathname, filePath) {
  // Ensure the architecture exists in staticFilesByArch
  if (!WebAppInternals.staticFilesByArch[arch]) {
    WebAppInternals.staticFilesByArch[arch] = Object.create(null);
  }

  // Get the static files object for this architecture
  const staticFiles = WebAppInternals.staticFilesByArch[arch];

  // Skip if already registered
  if (staticFiles[pathname]) {
    // Ensure the entry is marked as cacheable
    staticFiles[pathname].cacheable = true;
    return staticFiles[pathname];
  }

  // Determine file type based on extension
  const type = pathname.endsWith(".js") ? "js" :
    pathname.endsWith(".css") ? "css" :
      pathname.endsWith(".json") ? "json" : undefined;

  // Extract hash from filename (assuming it's the second part after splitting by '.')
  const filename = pathname.split("/").pop();
  const hash = filename.split(".")[1];

  // Register the asset
  staticFiles[pathname] = {
    absolutePath: filePath,
    cacheable: true, // Most rspack assets are cacheable
    hash,
    type
  };

  return staticFiles[pathname];
}

// Store the original staticFilesMiddleware
const originalStaticFilesMiddleware = WebAppInternals.staticFilesMiddleware;

// Handle rspack assets on-demand to add Meteor's static files headers
WebAppInternals.staticFilesMiddleware = async function(staticFilesByArch, req, res, next) {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  try {
    // Check if this is a rspack asset request
    const chunksMatch = pathname.match(RSPACK_CHUNKS_REGEX);
    const assetsMatch = pathname.match(RSPACK_ASSETS_REGEX);

    if (chunksMatch || assetsMatch) {
      const cwd = process.cwd();
      const architectures = ["web.browser", "web.browser.legacy", "web.cordova"];
      WebApp.categorizeRequest(req);

      // Try to find the file on disk
      const context = chunksMatch ? rspackChunksContext : rspackAssetsContext;
      const filename = (chunksMatch ? chunksMatch[1] : assetsMatch[1]);
      const filePath = path.join(cwd, context, filename);

      architectures.forEach(archName => {
        registerRspackStaticAsset(archName, pathname, filePath);
      });
    }
  } catch (e) {
    console.error(`Error handling rspack asset: ${e.message}`);
  }

  // Call the original middleware
  return originalStaticFilesMiddleware(staticFilesByArch, req, res, next);
};

// Rspack emits asset URLs into the app's HTML (e.g. the
// <link href="/build-chunks/main.css"> injected through HtmlRspackPlugin) as
// root-relative paths with no knowledge of ROOT_URL's path prefix. When a
// prefix is configured, rewrite those URLs per request so they resolve under
// the prefix. In development they are additionally routed straight to the
// dev-server proxy mounted at /__rspack__, avoiding a redirect hop.
// See meteor/meteor#14523.
if (rootUrlPathPrefix) {
  const devProxyBase = shouldEnableDevHMRProxy ? '/__rspack__' : '';
  const assetTagPattern = new RegExp(
    `(<(?:link|script)\\b[^>]*\\b(?:href|src)=")(/(?:${escapeRegExp(
      rspackChunksContext
    )}|${escapeRegExp(rspackAssetsContext)})/)(web\\.(?:browser(?:\\.legacy)?|cordova)/)?`,
    'g'
  );
  const proxyTagPattern = new RegExp(
    '(<(?:link|script)\\b[^>]*\\b(?:href|src)=")(/__rspack__/)',
    'g'
  );

  // Replacement callbacks (not strings): the prefix may legally contain
  // characters like "$" that carry special meaning in replacement strings.
  const rewriteRspackAssetUrls = html =>
    typeof html === 'string'
      ? html
          .replace(
            assetTagPattern,
            (match, opening, assetPath, architecturePath) =>
              `${opening}${rootUrlPathPrefix}${architecturePath ? '' : devProxyBase}${assetPath}${architecturePath || ''}`
          )
          .replace(
            proxyTagPattern,
            (match, opening, assetPath) =>
              `${opening}${rootUrlPathPrefix}${assetPath}`
          )
      : html;

  WebAppInternals.registerBoilerplateDataCallback(
    'rspack-root-url-path-prefix',
    (request, data) => {
      let madeChanges = false;
      for (const field of ['head', 'body', 'dynamicHead', 'dynamicBody']) {
        const rewritten = rewriteRspackAssetUrls(data[field]);
        if (rewritten !== data[field]) {
          data[field] = rewritten;
          madeChanges = true;
        }
      }
      return madeChanges;
    }
  );
}
