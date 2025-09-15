import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { shuffleString } from 'meteor/tools-core/lib/string';
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  RSPACK_CHUNKS_CONTEXT,
  RSPACK_ASSETS_CONTEXT,
  RSPACK_HOT_UPDATE_REGEX,
  RSPACK_BUNDLES_REGEX,
  RSPACK_ASSETS_REGEX,
} from "./lib/constants";

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
    const bundlesMatch = req.url.match(RSPACK_BUNDLES_REGEX);
    if (bundlesMatch) {
      // Redirect "/bundles/foo.js" → "/__rspack__/build-chunks/foo.js"
      const target = `/__rspack__/${RSPACK_CHUNKS_CONTEXT}/${bundlesMatch[1]}`;
      res.writeHead(307, { Location: target });
      return res.end();
    }

    // 3) match "/build-assets/<anything>"
    const assetsMatch = req.url.match(RSPACK_ASSETS_REGEX);
    if (assetsMatch) {
      // Redirect "/build-assets/foo.js" → "/__rspack__/build-assets/foo.js"
      const target = `/__rspack__/${RSPACK_ASSETS_CONTEXT}/${assetsMatch[1]}`;
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
