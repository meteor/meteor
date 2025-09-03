import RspackMeteorHtmlPlugin, { loadHtmlRspackPluginFromHost } from './RspackMeteorHtmlPlugin.js';

/**
 * A plugin that composes the original HtmlRspackPlugin from @rspack/core
 * and RspackMeteorHtmlPlugin, in that order.
 */
export default class HtmlRspackPlugin {
  constructor(options = {}) {
    this.options = options;
  }

  apply(compiler) {
    // Load the original HtmlRspackPlugin from the host project
    const OriginalHtmlRspackPlugin = loadHtmlRspackPluginFromHost(compiler);

    if (!OriginalHtmlRspackPlugin) {
      throw new Error('Could not load HtmlRspackPlugin from host project.');
    }

    // Apply the original HtmlRspackPlugin
    const originalPlugin = new OriginalHtmlRspackPlugin(this.options);
    originalPlugin.apply(compiler);

    // Apply the RspackMeteorHtmlPlugin
    const meteorPlugin = new RspackMeteorHtmlPlugin();
    meteorPlugin.apply(compiler);
  }
}
