var archinfo = require('./archinfo.js');
var buildmessage = require('./buildmessage.js');
var files = require('./files.js');
var _ = require('underscore');
import utils from './utils.js';

let nextId = 1;

exports.SourceProcessor = function (options) {
  var self = this;
  self.isopack = options.isopack;
  self.extensions = (options.extensions || []).slice();
  self.filenames = (options.filenames || []).slice();
  self.archMatching = options.archMatching;
  self.isTemplate = !! options.isTemplate;
  self.factoryFunction = options.factoryFunction;
  self.id = `${ options.isopack.displayName() }#${ nextId++ }`;
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
    try {
      self.userPlugin = buildmessage.markBoundary(self.factoryFunction).call(
        null);
      // If we have a disk cache directory and the plugin wants it, use it.
      if (self.isopack.pluginCacheDir &&
          self.userPlugin.setDiskCacheDirectory) {
        const markedMethod = buildmessage.markBoundary(
          self.userPlugin.setDiskCacheDirectory.bind(self.userPlugin));
        markedMethod(self.isopack.pluginCacheDir);
      }
    } catch (e) {
      buildmessage.exception(e);
    }
  },
  relevantForArch: function (arch) {
    var self = this;
    return ! self.archMatching || archinfo.matches(arch, self.archMatching);
  }
});

// Represents a set of SourceProcessors available in a given package. They may
// not have conflicting extensions or filenames.
export class SourceProcessorSet {
  constructor(myPackageDisplayName,
              { hardcodeJs, singlePackage, allowConflicts }) {
    // For error messages only.
    this._myPackageDisplayName = myPackageDisplayName;
    // If this represents the SourceProcessors *registered* by a single package
    // (vs those *available* to a package), use different error messages.
    this._singlePackage = singlePackage;
    // If this is being used for *compilers*, we hardcode *.js. If it is being
    // used for linters, we don't.
    this._hardcodeJs = !! hardcodeJs;
    // Multiple linters may be registered on the same extension or filename, but
    // not compilers.
    this._allowConflicts = !! allowConflicts;

    // Map from extension -> [SourceProcessor]
    this._byExtension = {};
    // Map from basename -> [SourceProcessor]
    this._byFilename = {};
    // This is just an duplicate-free list of all SourceProcessors in
    // byExtension or byFilename.
    this.allSourceProcessors = [];
    // extension -> { handler, packageDisplayName, isTemplate, archMatching }
    this._legacyHandlers = {};
  }

  _conflictError(package1, package2, conflict) {
    if (this._singlePackage) {
      buildmessage.error(
        `plugins in package ${ this._myPackageDisplayName } define multiple ` +
          `handlers for ${ conflict }`);
    } else {
      buildmessage.error(
        `conflict: two packages included in ${ this._myPackageDisplayName } ` +
          `(${ package1 } and ${ package2 }) are both trying to handle ` +
          conflict);
    }
  }

  addSourceProcessor(sp) {
    buildmessage.assertInJob();
    this._addSourceProcessorHelper(sp, sp.extensions, this._byExtension, '*.');
    this._addSourceProcessorHelper(sp, sp.filenames, this._byFilename, '');
    // If everything conflicted, then the SourceProcessors will be in
    // allSourceProcessors but not any of the data structures, but in that case
    // the caller should be checking for errors anyway.
    this.allSourceProcessors.push(sp);
  }
  _addSourceProcessorHelper(sp, things, byThing, errorPrefix) {
    buildmessage.assertInJob();

    things.forEach((thing) => {
      if (byThing.hasOwnProperty(thing)) {
        if (this._allowConflicts) {
          byThing[thing].push(sp);
        } else {
          this._conflictError(sp.isopack.displayName(),
                              byThing[thing][0].isopack.displayName(),
                              errorPrefix + thing);
          // recover by ignoring this one
        }
      } else {
        byThing[thing] = [sp];
      }
    });
  }

  addLegacyHandler({ extension, handler, packageDisplayName, isTemplate,
                     archMatching }) {
    if (this._allowConflicts)
      throw Error("linters have no legacy handlers");

    if (this._byExtension.hasOwnProperty(extension)) {
      this._conflictError(packageDisplayName,
                          this._byExtension[extension].isopack.displayName(),
                          '*.' + extension);
      // recover by ignoring
      return;
    }
    if (this._legacyHandlers.hasOwnProperty(extension)) {
      this._conflictError(packageDisplayName,
                          this._legacyHandlers[extension].packageDisplayName,
                          '*.' + extension);
      // recover by ignoring
      return;
    }
    this._legacyHandlers[extension] =
      {handler, packageDisplayName, isTemplate, archMatching};
  }

  // Adds all the source processors (and legacy handlers) from the other set to
  // this one. Logs buildmessage errors on conflict.  Ignores packageDisplayName
  // and singlePackage.  If arch is set, skips SourceProcessors that
  // don't match it.
  merge(otherSet, options = {}) {
    const { arch } = options;
    buildmessage.assertInJob();
    otherSet.allSourceProcessors.forEach((sourceProcessor) => {
      if (! arch || sourceProcessor.relevantForArch(arch)) {
        this.addSourceProcessor(sourceProcessor);
      }
    });
    _.each(otherSet._legacyHandlers, (info, extension) => {
      const { handler, packageDisplayName, isTemplate, archMatching } = info;
      this.addLegacyHandler(
        {extension, handler, packageDisplayName, isTemplate, archMatching});
    });
  }

  // Note: Only returns SourceProcessors, not legacy handlers.
  getByExtension(extension) {
    if (this._allowConflicts)
      throw Error("Can't call getByExtension for linters");

    if (this._byExtension.hasOwnProperty(extension)) {
      return this._byExtension[extension][0];
    }
    return null;
  }

  // Note: Only returns SourceProcessors, not legacy handlers.
  getByFilename(filename) {
    if (this._allowConflicts)
      throw Error("Can't call getByFilename for linters");

    if (this._byFilename.hasOwnProperty(filename)) {
      return this._byFilename[filename][0];
    }
    return null;
  }

  // filename, arch -> {
  //    type: "extension"/"filename"/"legacyHandler"/"wrong-arch"/"unmatched",
  //    legacyHandler, extension, sourceProcessors, legacyIsTemplate }
  classifyFilename(filename, arch) {
    // First check to see if a plugin registered for this exact filename.
    if (this._byFilename.hasOwnProperty(filename)) {
      return maybeWrongArch({
        type: 'filename',
        sourceProcessors: this._byFilename[filename].slice()
      });
    }

    // Now check to see if a plugin registered for an extension. We prefer
    // longer extensions.
    const parts = filename.split('.');
    // don't use iteration functions, so we can return (and start at #1)
    for (let i = 1; i < parts.length; i++) {
      const extension = parts.slice(i).join('.');
      // We specially handle 'js' in the build tool, because you can't provide a
      // plugin to handle 'js' files, because the plugin would need to be built
      // with JavaScript itself!  Places that hardcode JS are tagged with
      // #HardcodeJs.
      if (this._hardcodeJs && extension === 'js') {
        return {
          type: 'extension',
          extension: 'js'
        };
      }

      if (this._byExtension.hasOwnProperty(extension)) {
        return maybeWrongArch({
          type: 'extension',
          extension,
          sourceProcessors: this._byExtension[extension]
        });
      }

      if (this._legacyHandlers.hasOwnProperty(extension)) {
        const legacy = this._legacyHandlers[extension];
        if (legacy.archMatching &&
            ! archinfo.matches(arch, legacy.archMatching)) {
          return { type: 'wrong-arch' };
        }
        return {
          type: 'legacyHandler',
          extension,
          legacyHandler: legacy.handler,
          legacyIsTemplate: legacy.isTempate
        };
      }
    }

    // Nothing matches; it must be a static asset (or a non-linted file).
    return { type: 'unmatched' };

    // If there's a SourceProcessor (or legacy handler) registered for this file
    // but not for this arch, we want to ignore it instead of processing it or
    // treating it as a static asset. (Note that prior to the batch-plugins
    // project, files added in a package with `api.addFiles('foo.bar')` where
    // *.bar is a web-specific legacy handler (eg) would end up adding 'foo.bar'
    // as a static asset on non-web programs, which was unintended. This didn't
    // happen in apps because initFromAppDir's getSourcesFunc never added them.)
    function maybeWrongArch(classification) {
      classification.sourceProcessors = classification.sourceProcessors.filter(
        (sourceProcessor) => sourceProcessor.relevantForArch(arch)
      );
      return classification.sourceProcessors.length
        ? classification : { type: 'wrong-arch' };
    }
  }

  isEmpty() {
    return _.isEmpty(this._byFilename) && _.isEmpty(this._byExtension) &&
      _.isEmpty(this._legacyHandlers);
  }

  // Returns an options object suitable for passing to
  // `watch.readAndWatchDirectory` to find source files processed by this
  // SourceProcessorSet.
  appReadDirectoryOptions(arch) {
    const include = [];
    const names = [];

    function addExtension(ext) {
      include.push(new RegExp('\\.' + utils.quotemeta(ext) + '$'));
    }
    _.each(this._byExtension, (sourceProcessors, ext) => {
      if (sourceProcessors.some(sp => sp.relevantForArch(arch))) {
        addExtension(ext);
      }
    });
    Object.keys(this._legacyHandlers).forEach(addExtension);
    this._hardcodeJs && addExtension('js');

    _.each(this._byFilename, (sourceProcessors, filename) => {
      if (sourceProcessors.some(sp => sp.relevantForArch(arch))) {
        names.push(filename);
      }
    });
    return {include, names, exclude: []};
  }
}

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
   * @summary Returns a string symbol representing the architecture that is
   * targetted by processing this file. Can be used to implement caching.
   * XXX BBP is this doc string good?
   * @memberof InputFile
   * @returns {String}
   */
  getArch: function () {
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
