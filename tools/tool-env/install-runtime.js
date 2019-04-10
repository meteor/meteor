"use strict";

const { noContext } = require("optimism");
if (noContext) {
  // If we're using a modern version of the optimism package that supports
  // noContext, we can use it to wrap Fiber.yield so that the current
  // context is suspended before any yield and restored immediately after.
  const Fiber = require("fibers");
  const originalYield = Fiber.yield;
  Fiber.yield = function () {
    return noContext(originalYield, arguments, Fiber);
  };
}

// Install ES2015-complaint polyfills for Object, Array, String, Function,
// Symbol, Map, Set, and Promise, patching the native implementations when
// they are available.
require("./install-promise.js");

const Module = module.constructor;
const Mp = Module.prototype;

Mp.resolve = function (id) {
  return Module._resolveFilename(id, this);
};

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
