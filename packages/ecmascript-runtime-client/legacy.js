try {
  Symbol = exports.Symbol = global.Symbol || require("core-js/es/symbol");
  Map = exports.Map = global.Map || require("core-js/es/map");
  Set = exports.Set = global.Set || require("core-js/es/set");
} catch (e) {
  throw new Error([
    "The core-js npm package could not be found in your node_modules ",
    "directory. Please run the following command to install it:",
    "",
    "  meteor npm install --save core-js",
    ""
  ].join("\n"));
}

// ECMAScript 2015 polyfills.
require("core-js/es/array");
require("core-js/es/function");
require("core-js/es/math");
require("core-js/es/object");
require("core-js/es/regexp");
require("core-js/es/string");
require("core-js/es/weak-map");
require("core-js/es/weak-set");

// If the Reflect global namespace is missing or undefined, explicitly
// initialize it as undefined, so that expressions like _typeof(Reflect)
// won't throw in older browsers. Fixes #9598.
if (typeof Reflect === "undefined") {
  global.Reflect = void 0;
}

// We want everything from the core-js/es/number module except
// es.number.constructor.
require('core-js/modules/es.number.epsilon');
require('core-js/modules/es.number.is-finite');
require('core-js/modules/es.number.is-integer');
require('core-js/modules/es.number.is-nan');
require('core-js/modules/es.number.is-safe-integer');
require('core-js/modules/es.number.max-safe-integer');
require('core-js/modules/es.number.min-safe-integer');
require('core-js/modules/es.number.parse-float');
require('core-js/modules/es.number.parse-int');

// Typed Arrays
require('core-js/modules/es.typed-array.uint8-array');
require('core-js/modules/es.typed-array.uint32-array');

require("./modern.js");
