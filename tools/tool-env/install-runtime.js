"use strict";

// Install ES2015-complaint polyfills for Object, Array, String, Function,
// Symbol, Map, Set, and Promise, patching the native implementations when
// they are available.
require("./install-promise.js");

const Module = module.constructor;
const Mp = Module.prototype;

// Enable the module.{watch,export,...} runtime API needed by Reify.
require("reify/lib/runtime").enable(Mp);

const moduleLoad = Mp.load;
Mp.load = function (filename) {
  const result = moduleLoad.apply(this, arguments);
  const runSetters = this.runSetters || this.runModuleSetters;
  if (typeof runSetters === "function") {
    // Make sure we call module.runSetters (or module.runModuleSetters, a
    // legacy synonym) whenever a module finishes loading.
    runSetters.call(this);
  }
  return result;
};

// Installs source map support with a hook to add functions to look for
// source maps in custom places.
require('./source-map-retriever-stack.js');
