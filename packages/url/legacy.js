try {
  require("url-search-params-polyfill");
  URLSearchParams = window.URLSearchParams;
  exports.URLSearchParams = URLSearchParams;

  require("core-js/proposals/url");
  URL = window.URL;
  exports.URL = URL;
} catch (e) {
  throw new Error([
    "The core-js npm package could not be found in your node_modules ",
    "directory. Please run the following command to install it:",
    "",
    "  meteor npm install --save core-js",
    ""
  ].join("\n"));
}

// backwards compatibility
require('./modern.js');
