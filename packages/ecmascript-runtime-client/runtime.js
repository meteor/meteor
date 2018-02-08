try {
  require("core-js/modules/es6.symbol");
  require("core-js/modules/es6.map");
  require("core-js/modules/es6.set");

  var core = function () {
    try {
      return require("core-js/modules/_core");
    } catch (e) {
      // Older versions of core-js had a different file layout.
      return require("core-js/modules/$.core");
    }
  }();

} catch (e) {
  throw new Error([
    "The core-js npm package could not be found in your node_modules ",
    "directory. Please run the following command to install it:",
    "",
    "  meteor npm install --save core-js",
    ""
  ].join("\n"));
}

Symbol = exports.Symbol = core.Symbol;
Map = exports.Map = core.Map;
Set = exports.Set = core.Set;

// ECMAScript 2015 polyfills.
require("core-js/es6/array");
require("core-js/es6/function");
require("core-js/es6/math");
require("core-js/es6/object");
require("core-js/es6/regexp");
require("core-js/es6/string");
require("core-js/es6/weak-map");
require("core-js/es6/weak-set");

// If the Reflect global namespace is missing or undefined, explicitly
// initialize it as undefined, so that expressions like _typeof(Reflect)
// won't throw in older browsers. Fixes #9598.
if (typeof Reflect === "undefined") {
  global.Reflect = void 0;
}

// ECMAScript 2017 polyfills.
require("core-js/es7/array");
require("core-js/es7/object");
require("core-js/modules/es7.string.pad-start");
require("core-js/modules/es7.string.pad-end");

// We want everything from the core-js/es6/number module except
// es6.number.constructor.
require('core-js/modules/es6.number.epsilon');
require('core-js/modules/es6.number.is-finite');
require('core-js/modules/es6.number.is-integer');
require('core-js/modules/es6.number.is-nan');
require('core-js/modules/es6.number.is-safe-integer');
require('core-js/modules/es6.number.max-safe-integer');
require('core-js/modules/es6.number.min-safe-integer');
require('core-js/modules/es6.number.parse-float');
require('core-js/modules/es6.number.parse-int');

// Typed Arrays
require('core-js/modules/es6.typed.uint8-array');
require('core-js/modules/es6.typed.uint32-array');
