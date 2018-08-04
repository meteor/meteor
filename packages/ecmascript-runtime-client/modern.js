try {
  require("core-js/modules/es7.object.get-own-property-descriptors");
} catch (e) {
  throw new Error([
    "The core-js npm package could not be found in your node_modules ",
    "directory. Please run the following command to install it:",
    "",
    "  meteor npm install --save core-js",
    ""
  ].join("\n"));
}

require("core-js/modules/es6.object.is");
require("core-js/modules/es6.function.name");
require("core-js/modules/es6.number.is-finite");
require("core-js/modules/es6.number.is-nan");
require("core-js/modules/es7.array.flatten");
require("core-js/modules/es7.array.flat-map");
require("core-js/modules/es7.object.values");
require("core-js/modules/es7.object.entries");
require("core-js/modules/es7.string.pad-start");
require("core-js/modules/es7.string.pad-end");
