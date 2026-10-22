const { defineConfig: rspackDefineConfig } = require('@rspack/cli');
const HtmlRspackPlugin = require('./plugins/HtmlRspackPlugin.js');

/**
 * @typedef {import('rspack').Configuration & {
 *   meteor?: { packageNamespace?: string }
 * }} MeteorRspackConfig
 */

/**
 * @typedef {(env: Record<string, any>, argv: Record<string, any>) => MeteorRspackConfig} ConfigFactory
 */

/**
 * Wrap rspack.defineConfig but only accept a factory function.
 * @param {ConfigFactory} factory
 * @returns {ReturnType<typeof rspackDefineConfig>}
 */
function defineConfig(factory) {
  return rspackDefineConfig(factory);
}

// Export our helper plus passthrough as default export
module.exports = defineConfig;

// Export the HtmlRspackPlugin and defineConfig as named exports
module.exports.defineConfig = defineConfig;
module.exports.HtmlRspackPlugin = HtmlRspackPlugin;
