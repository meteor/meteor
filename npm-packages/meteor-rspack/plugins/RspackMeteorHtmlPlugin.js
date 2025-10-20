const path = require('node:path');
const { createRequire } = require('node:module');

function loadHtmlRspackPluginFromHost(compiler) {
  // Prefer the compiler's context; fall back to process.cwd()
  const ctx = compiler.options?.context || compiler.context || process.cwd();
  const requireFromHost = createRequire(path.join(ctx, 'package.json'));

  const core = requireFromHost('@rspack/core'); // host's instance
  // Rspack exports can be shaped a couple ways; be defensive
  return core.HtmlRspackPlugin || core.rspack?.HtmlRspackPlugin || core.default?.HtmlRspackPlugin;
}

/**
 * Rspack plugin to:
 * 1. Remove the injected `*-rspack.js` script tags
 * 2. Strip <!doctype> and <html>…</html> wrappers from the final HTML
 */
class RspackMeteorHtmlPlugin {
  apply(compiler) {
    const HtmlRspackPlugin = loadHtmlRspackPluginFromHost(compiler);
    if (!HtmlRspackPlugin?.getCompilationHooks) {
      throw new Error('Could not load HtmlRspackPlugin from host project.');
    }

    compiler.hooks.compilation.tap('RspackMeteorHtmlPlugin', compilation => {
      const hooks = HtmlRspackPlugin.getCompilationHooks(compilation);

      // remove <script src="...*-rspack.js">
      hooks.alterAssetTags.tap('RspackMeteorHtmlPlugin', data => {
        data.assetTags.scripts = data.assetTags.scripts.filter(t => {
          const src = t.attributes?.src || t.asset || '';
          return !(t.tagName === 'script' && /(?:^|\/)[^\/]*-rspack\.js$/i.test(src));
        });
      });

      // unwrap <!doctype> and <html>…</html>
      hooks.beforeEmit.tap('RspackMeteorHtmlPlugin', data => {
        data.html = data.html
          .replace(/<!doctype[^>]*>\s*/i, '')
          .replace(/<html[^>]*>\s*/i, '')
          .replace(/\s*<\/html>\s*$/i, '')
          .trim();
      });
    });
  }
}

module.exports = RspackMeteorHtmlPlugin;
module.exports.loadHtmlRspackPluginFromHost = loadHtmlRspackPluginFromHost;
