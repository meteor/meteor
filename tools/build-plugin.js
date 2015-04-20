var archinfo = require('./archinfo.js');
var buildmessage = require('./buildmessage.js');
var files = require('./files.js');
var buildmessage = require('./buildmessage.js');
var _ = require('underscore');

exports.BuildPluginDefintion = function (options, factoryFunction) {
  var self = this;
  self.id = options.id;
  self.isopack = options.isopack;
  self.extensions = options.extensions.slice();
  self.archMatching = options.archMatching;
  self.isTemplate = !! options.isTemplate;
  self.buildPluginClass = options.buildPluginClass;
  self.factoryFunction = factoryFunction;
};
_.extend(exports.BuildPluginDefintion.prototype, {
  instantiatePlugin: function () {
    var self = this;
    // XXX BBP proper error handling --- this is running user-supplied plugin
    // code
    var userPlugin = self.factoryFunction();
    return new self.buildPluginClass(self, userPlugin);
  },
  relevantForArch: function (arch) {
    var self = this;
    return ! self.archMatching || archinfo.matches(arch, self.archMatching);
  }
});

// This is the base class of the object presented to the user's plugin code.
// XXX BBP actually design its API
// XXX BBP decide if the API always presents / to the code (it probably
// should because you're not supposed to do your own IO anyway)
exports.InputFile = function (resourceSlot) {
};
_.extend(exports.InputFile.prototype, {
  // XXX BBP refine this API and document it
  getContentsAsBuffer: function () {
    throw new Error("Not Implemented");
  },
  // XXX is this null for app?
  getPackageName: function () {
    throw new Error("Not Implemented");
  },
  getPathInPackage: function () {
    throw new Error("Not Implemented");
  },

  getContentsAsString: function () {
    var self = this;
    return self.getContentsAsBuffer().toString('utf8');
  },
  getBasename: function () {
    var self = this;
    return files.pathBasename(self.getPathInPackage());
  },
  getDirname: function () {
    var self = this;
    return files.pathDirname(self.getPathInPackage());
  },
  error: function (options) {
    var self = this;
    var relPath = self.getPathInPackage();
    buildmessage.error(options.message || ("error building " + relPath), {
      file: options.sourcePath || relPath,
      line: options.line ? options.line : undefined,
      column: options.column ? options.column : undefined,
      func: options.func ? options.func : undefined
    });
    // XXX BBP handle errors here
  }
});

