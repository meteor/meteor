try {
  require("core-js/modules/es.object.get-own-property-descriptors");
} catch (e) {
  throw new Error([
    "The core-js npm package could not be found in your node_modules ",
    "directory. Please run the following command to install it:",
    "",
    "  meteor npm install --save core-js",
    ""
  ].join("\n"));
}

require("core-js/modules/es.object.is");
require("core-js/modules/es.function.name");
require("core-js/modules/es.number.is-finite");
require("core-js/modules/es.number.is-nan");
require("core-js/modules/es.array.flat");
require("core-js/modules/es.array.flat-map");
require("core-js/modules/es.object.from-entries");
require("core-js/modules/es.string.pad-start");
require("core-js/modules/es.string.pad-end");
require("core-js/modules/es.string.trim-start");
require("core-js/modules/es.string.trim-end");
require("core-js/modules/es.symbol.async-iterator");
