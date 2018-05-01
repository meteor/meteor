// This module contains various legacy workarounds for @babel/runtime issues
// in older browsers. Note that this module is loaded only in legacy
// environments, and no changes are made unless they are necessary.

var hasOwn = Object.prototype.hasOwnProperty;
var helpers = {};

function assign(into, from) {
  Object.keys(from).forEach(function (key) {
    if (! hasOwn.call(into, key)) {
      into[key] = from[key];
    }
  });
  return into;
}

var obj = {};
obj.__proto__ = { test: obj };
var canSetProto = obj.test === obj;

if (! canSetProto) {
  // Browsers that don't allow setting __proto__ (and also do not support
  // Object.setPrototypeOf) cannot use the inheritsLoose @babel/runtime
  // helper module, so we replace it with a similar module that works
  // infinitely better in older browsers.
  helpers.inheritsLoose = function (require, exports, module) {
    module.exports = function (subclass, superclass) {
      subclass.prototype = assign(
        Object.create(superclass.prototype),
        subclass.prototype
      );
      // This isn't true static inheritance, since static properties added
      // to or removed from the superclass later will not be reflected on
      // the subclass, but this approximation is the best that we can do.
      assign(subclass, superclass);
    };
  };
}

// Install @babel/runtime/helpers/... modules that will take precedence
// over the actual modules, regardless of which gets installed first,
// because these replacement modules don't have a .js file extension.
if (Object.keys(helpers).length > 0) {
  meteorInstall({
    node_modules: {
      "@babel": {
        runtime: {
          helpers: helpers
        }
      }
    }
  });
}
