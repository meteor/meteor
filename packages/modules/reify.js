var Module = module.constructor;
require("reify/lib/runtime").enable(Module);
var Mp = Module.prototype;
Mp.importSync = Mp.importSync || Mp.import;
Mp.import = Mp.import || Mp.importSync;
