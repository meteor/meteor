const { defineConfig } = require('@meteorjs/rspack');
const { GenerateSW } = require('workbox-webpack-plugin');

/**
 * Rspack configuration for Meteor projects.
 *
 * Provides typed flags on the `Meteor` object, such as:
 * - `Meteor.isClient` / `Meteor.isServer`
 * - `Meteor.isDevelopment` / `Meteor.isProduction`
 * - …and other flags available
 *
 * Use these flags to adjust your build settings based on environment.
 */
module.exports = defineConfig(Meteor => {
  return {
    ...Meteor.compileWithMeteor(["thread-stream"]),
    ...Meteor.compileWithRspack(["grubba-rpc"]),
    plugins: [
      // Only generate the service worker for the client build
      Meteor.isClient &&
        new GenerateSW({
          swDest: 'sw.js',
          // Activate immediately without waiting for existing clients to close
          skipWaiting: true,
          // Take control of all open pages as soon as the SW activates
          clientsClaim: true,
          // Remove outdated caches from previous SW versions
          cleanupOutdatedCaches: true,
          // Embed the Workbox runtime in sw.js instead of loading it from a CDN
          inlineWorkboxRuntime: true,
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          // Skip precaching for build output — runtime caching handles app bundles
          exclude: [/./],
          // Precache static files that should be available offline immediately
          // (these are cached during SW installation, no fetch required)
          additionalManifestEntries: [
            { url: '/icon.png', revision: '1' },
          ],
          runtimeCaching: [
            // Never cache HMR hot-update files
            {
              urlPattern: /\.hot-update\./,
              handler: 'NetworkOnly',
            },
            // Navigation requests: network-first with fallback
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages',
                networkTimeoutSeconds: 15,
                expiration: {
                  maxEntries: 20,
                },
              },
            },
            // Meteor/Rspack build assets (dev server, asset & chunk contexts)
            {
              urlPattern: new RegExp(
                `(/__rspack__/|/${Meteor.assetsContext}/|/${Meteor.chunksContext}/|[?&](hash|meteor_css_resource|meteor_js_resource)=)`
              ),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'bundles',
                // Meteor serves assets with Vary headers that can cause cache misses
                matchOptions: { ignoreVary: true },
              },
            },
            // Static assets: scripts, styles, workers
            {
              urlPattern: ({ request }) =>
                request.destination === 'style' ||
                request.destination === 'script' ||
                request.destination === 'worker',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'assets',
                cacheableResponse: {
                  statuses: [200],
                },
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 7 * 24 * 60 * 60,
                },
              },
            },
            // Images: cache-first for fast repeat loads
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: { maxEntries: 30 },
                matchOptions: { ignoreVary: true },
              },
            },
          ],
        }),
    ].filter(Boolean),
    // GenerateSW runs per compiler (client + legacy); suppress the warning
    ignoreWarnings: [/GenerateSW has been called multiple times/],
  };
});
