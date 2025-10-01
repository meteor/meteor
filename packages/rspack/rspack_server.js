import { Meteor } from 'meteor/meteor';
import { WebApp, WebAppInternals } from 'meteor/webapp';
import { shuffleString } from 'meteor/tools-core/lib/string';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { parse as parseUrl } from 'url';
import {
  RSPACK_CHUNKS_CONTEXT,
  RSPACK_ASSETS_CONTEXT,
  RSPACK_HOT_UPDATE_REGEX,
} from "./lib/constants";

// Define constants for both development and production
const rspackChunksContext = process.env.RSPACK_CHUNKS_CONTEXT || RSPACK_CHUNKS_CONTEXT;
const rspackAssetsContext = process.env.RSPACK_ASSETS_CONTEXT || RSPACK_ASSETS_CONTEXT;

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

if (Meteor.isDevelopment) {
  // Target URL for the Rspack dev server
  const target = `http://localhost:${process.env.RSPACK_DEVSERVER_PORT}`;

  // Proxy HMR websocket upgrade requests
  WebApp.connectHandlers.use('/ws',
    createProxyMiddleware( {
      target,
      ws: true,
      logLevel: 'debug'
    })
  );

  // Proxy all dev asset requests under the rspack prefix
  WebApp.connectHandlers.use('/__rspack__',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
      logLevel: 'debug',
    })
  );

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
    if (bundlesMatch) {
      // Redirect "/bundles/foo.js" → "/__rspack__/build-chunks/foo.js"
      const target = `/__rspack__/${rspackChunksContext}/${bundlesMatch[1]}`;
      res.writeHead(307, { Location: target });
      return res.end();
    }

    // 3) match "/build-assets/<anything>"
    const assetsMatch = req.url.match(RSPACK_ASSETS_REGEX);
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
  const pathname = parseUrl(req.url).pathname;

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
