import { Meteor } from 'meteor/meteor';
import { WebApp, WebAppInternals } from 'meteor/webapp';
import path from 'path';
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
  const { createProxyMiddleware } = require('http-proxy-middleware');

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
  // send may already have prepared headers before opening the file fails.
  for (const header of [
    'ETag', 'Last-Modified', 'Content-Type', 'Content-Length',
    'Content-Range', 'Accept-Ranges', 'X-SourceMap',
  ]) {
    res.removeHeader(header);
  }
  res.writeHead(404, { 'Cache-Control': 'no-store' });
  res.end();
}

// Store the original staticFilesMiddleware
const originalStaticFilesMiddleware = WebAppInternals.staticFilesMiddleware;

// Handle rspack assets on-demand to add Meteor's static files headers
WebAppInternals.staticFilesMiddleware = async function(staticFilesByArch, req, res, next) {
  try {
    // WebApp passes malformed URI encodings to the next handler. Missing
    // Rspack assets must not fall through to the application's HTML response.
    if (req.url.includes('%')) {
      try {
        decodeURIComponent(req.url.split('?')[0]);
      } catch {
        const { path: requestPath } = WebApp.categorizeRequest(req);
        if (RSPACK_CHUNKS_REGEX.test(requestPath) || RSPACK_ASSETS_REGEX.test(requestPath)) {
          return rspackAssetNotFound(res);
        }
      }
    }

    return await originalStaticFilesMiddleware(staticFilesByArch, req, res, next,
      (files, originalPath, requestPath, arch) => {
        // WebApp has decoded the URL and waited for any client rebuild before
        // invoking this resolver. Use its architecture-specific path as well.
        const pathname = decodeURIComponent(requestPath);
        const chunksMatch = pathname.match(RSPACK_CHUNKS_REGEX);
        const assetsMatch = pathname.match(RSPACK_ASSETS_REGEX);
        if (!chunksMatch && !assetsMatch) {
          return WebAppInternals.getStaticFileInfo(files, originalPath, requestPath, arch);
        }

        const context = chunksMatch ? rspackChunksContext : rspackAssetsContext;
        const filename = (chunksMatch || assetsMatch)[1];
        const root = path.resolve(process.cwd(), context);
        const filePath = path.join(root, filename);
        const relativePath = path.relative(root, filePath);

        // Decode before resolving, and keep URL paths inside the selected
        // output directory. Backslashes are not URL separators.
        if (filename.includes('\\') || filename.includes('\0') ||
            relativePath === '..' || relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)) {
          rspackAssetNotFound(res);
          return null;
        }

        // Built bundles have manifest paths into the client program (or inline
        // content). Development output may instead live directly under cwd.
        const info = WebAppInternals.getStaticFileInfo(files,
          path.posix.normalize(originalPath), path.posix.normalize(pathname), arch);

        // Never put request-derived keys in the shared manifests, even for
        // existing files: URL aliases could otherwise grow them indefinitely.
        // Let WebApp's send stream check/open the file once and handle misses,
        // including removal between stat and open, without caching the result.
        return {
          ...(info || rspackStaticAssetInfo(pathname, filePath)),
          cacheable: true,
          onNotFound: rspackAssetNotFound,
        };
      });
  } catch (error) {
    next(error);
  }
};
