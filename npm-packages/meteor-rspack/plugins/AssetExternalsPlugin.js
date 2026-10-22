// AssetExternalsPlugin.js
//
// This plugin externalizes assets within CSS/SCSS and other files.
// It prevents Rspack from bundling assets referenced in CSS url() and similar contexts,
// allowing them to be served directly from the public directory.

// Regular expression to match CSS, SCSS, and other style files
const CSS_EXT_REGEX = /\.(css|scss|sass|less|styl)$/;

class AssetExternalsPlugin {
  constructor(options = {}) {
    this.pluginName = 'AssetExternalsPlugin';
    this.options = options;
  }

  apply(compiler) {
    // Add the externals function to handle asset URLs in CSS files
    compiler.options.externals = [
      ...compiler.options.externals || [],
      (data, callback) => {
        const req = data.request;

        // Webpack provides dependencyType === "url" for CSS url() deps.
        // Rspack is webpack-compatible here, but keep this tolerant.
        const isUrlDep = data.dependencyType === 'url';
        const issuer = data.contextInfo?.issuer || '';
        const fromCss = CSS_EXT_REGEX.test(issuer);

        if (req && req.startsWith('/') && (isUrlDep || fromCss)) {
          // Keep the URL as-is (served by your server from /public)
          return callback(null, `asset ${req}`);
        }

        callback();
      }
    ];
  }
}

module.exports = { AssetExternalsPlugin };
