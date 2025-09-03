import { defineConfig as rspackDefineConfig } from '@rspack/cli';
import HtmlRspackPlugin from './plugins/HtmlRspackPlugin.js';

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
export function defineConfig(factory) {
  return rspackDefineConfig(factory);
}

// Export our helper plus passthrough
export default defineConfig;

// Export the HtmlRspackPlugin
export { HtmlRspackPlugin };
