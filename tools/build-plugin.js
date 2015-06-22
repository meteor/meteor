var archinfo = require('./archinfo.js');
var buildmessage = require('./buildmessage.js');
var files = require('./files.js');
var _ = require('underscore');

exports.SourceProcessor = function (options) {
  var self = this;
  self.id = options.id;
  self.isopack = options.isopack;
  self.extensions = options.extensions.slice();
  self.archMatching = options.archMatching;
  self.isTemplate = !! options.isTemplate;
  self.factoryFunction = options.factoryFunction;
  self.userPlugin = null;
};
_.extend(exports.SourceProcessor.prototype, {
  // Call the user's factory function to get the actual build plugin object.
  // Note that we're supposed to have one userPlugin per project, so this
  // assumes that each Isopack object is specific to a project.  We don't run
  // this immediately on evaluating Plugin.registerCompiler; we instead wait
  // until the whole plugin file has been evaluated (so that it can use things
  // defined later in the file).
  instantiatePlugin: function () {
    var self = this;
    if (self.userPlugin) {
      throw Error("Called instantiatePlugin twice?");
    }
    // XXX BBP proper error handling --- this is running user-supplied plugin
    // code, and use markBoundary too
    self.userPlugin = self.factoryFunction.call(null);
    // If we have a disk cache directory and the plugin wants it, use it.
    // XXX BBP proper error handling
    if (self.isopack.pluginCacheDir && self.userPlugin.setDiskCacheDirectory) {
      self.userPlugin.setDiskCacheDirectory(self.isopack.pluginCacheDir);
    }
  },
  relevantForArch: function (arch) {
    var self = this;
    return ! self.archMatching || archinfo.matches(arch, self.archMatching);
  }
});

// This is the base class of the object presented to the user's plugin code.
exports.InputFile = function (resourceSlot) {
};
_.extend(exports.InputFile.prototype, {
  /**
   * @summary Returns the full contents of the file as a buffer.
   * @memberof InputFile
   * @returns {Buffer}
   */
  getContentsAsBuffer: function () {
    throw new Error("Not Implemented");
  },
  /**
   * @summary Returns the name of the package or `null` if the file is not in a
   * package.
   * @memberof InputFile
   * @returns {String}
   */
  getPackageName: function () {
    throw new Error("Not Implemented");
  },
  /**
   * @summary Returns the relative path of file to the package or app root
   * directory. The returned path always uses forward slashes.
   * @memberof InputFile
   * @returns {String}
   */
  getPathInPackage: function () {
    throw new Error("Not Implemented");
  },
  /**
   * @summary Returns a hash string for the file that can be used to implement
   * caching.
   * @memberof InputFile
   * @returns {String}
   */
  getSourceHash: function () {
    throw new Error("Not Implemented");
  },

  /**
   * @summary Returns the full contents of the file as a string.
   * @memberof InputFile
   * @returns {String}
   */
  getContentsAsString: function () {
    var self = this;
    return self.getContentsAsBuffer().toString('utf8');
  },
  /**
   * @summary Returns the filename of the file.
   * @memberof InputFile
   * @returns {String}
   */
  getBasename: function () {
    var self = this;
    return files.pathBasename(self.getPathInPackage());
  },
  /**
   * @summary Returns the directory path relative to the package or app root.
   * The returned path always uses forward slashes.
   * @memberof InputFile
   * @returns {String}
   */
  getDirname: function () {
    var self = this;
    return files.pathDirname(self.getPathInPackage());
  },
  /**
   * @summary Call this method to raise a compilation or linting error for the
   * file.
   * @param {Object} options
   * @param {String} options.message The error message to display.
   * @param {String} [options.sourcePath] The path to display in the error message.
   * @param {Integer} options.line The line number to display in the error message.
   * @param {String} options.func The function name to display in the error message.
   * @memberof InputFile
   */
  error: function (options) {
    var self = this;
    var relPath = self.getPathInPackage();
    buildmessage.error(options.message || ("error building " + relPath), {
      file: options.sourcePath || relPath,
      line: options.line ? options.line : undefined,
      column: options.column ? options.column : undefined,
      func: options.func ? options.func : undefined
    });
  }
});

