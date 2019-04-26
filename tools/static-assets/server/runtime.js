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
  if (typeof this.runSetters === "function") {
    // Make sure we call module.runSetters (or module.runModuleSetters, a
    // legacy synonym) whenever a module finishes loading.
    this.runSetters();
  }
  return result;
};
