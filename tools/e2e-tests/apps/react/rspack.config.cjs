const { defineConfig } = require('@meteorjs/rspack');
const path = require('path');
const CustomConsoleLogPlugin = require("./plugins/CustomConsoleLogPlugin");
const { demoRspackPlugin } = require("./plugins/demo-unplugin");

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
  const disabledPluginMatches = Meteor.isRun
    ? ['CustomConsoleLogPlugin']
    : Meteor.isTest
    ? /CustomConsoleLogPlugin/i
    : p => p?.constructor?.name === 'CustomConsoleLogPlugin';
  return {
    ...Meteor.disablePlugins(disabledPluginMatches),
    resolve: {
      alias: {
        "@public": path.resolve(__dirname, "public"),
      },
    },
    module: {
      rules: [
        // ✅ Images
        {
          test: /\.(png|jpe?g|gif|webp|avif)$/i,
          type: "asset/resource", // emits a file, returns URL string
        },
        // (optional) SVGs
        {
          test: /\.svg$/i,
          type: "asset/resource",
        },
      ],
    },
    plugins: [new CustomConsoleLogPlugin(), demoRspackPlugin()],
  };
});
