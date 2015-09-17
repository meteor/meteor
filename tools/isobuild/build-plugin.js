var archinfo = require('../utils/archinfo.js');
var buildmessage = require('../utils/buildmessage.js');
var files = require('../fs/files.js');
var _ = require('underscore');
import utils from '../utils/utils.js';

let nextId = 1;

exports.SourceProcessor = function (options) {
  var self = this;
  self.isopack = options.isopack;
  self.extensions = (options.extensions || []).slice();
  self.filenames = (options.filenames || []).slice();
  self.archMatching = options.archMatching;
  self.isTemplate = !! options.isTemplate;
  self.factoryFunction = options.factoryFunction;
  self.methodName = options.methodName;
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
    buildmessage.assertInCapture();
    if (self.userPlugin) {
      throw Error("Called instantiatePlugin twice?");
    }
    buildmessage.enterJob(
      `running ${self.methodName} callback in package ` +
        self.isopack.displayName(),
      () => {
        try {
          self.userPlugin = buildmessage.markBoundary(self.factoryFunction)
            .call(null);
          // If we have a disk cache directory and the plugin wants it, use it.
          if (self.isopack.pluginCacheDir &&
              self.userPlugin.setDiskCacheDirectory) {
            buildmessage.markBoundary(function () {
              self.userPlugin.setDiskCacheDirectory(
                files.convertToOSPath(self.isopack.pluginCacheDir)
              );
            })();
          }
        } catch (e) {
          buildmessage.exception(e);
        }
      }
    );
  },
  relevantForArch: function (arch) {
    var self = this;
    return ! self.archMatching || archinfo.matches(arch, self.archMatching);
  }
});

// Represents a set of SourceProcessors available in a given package. They may
// not have conflicting extensions or filenames.
export class SourceProcessorSet {
  constructor(myPackageDisplayName, {
    hardcodeJs,
    singlePackage,
    allowConflicts,
  } = {}) {
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

  // filename, arch -> SourceClassification
  classifyFilename(filename, arch) {
    // First check to see if a plugin registered for this exact filename.
    if (this._byFilename.hasOwnProperty(filename)) {
      return new SourceClassification('filename', {
        arch,
        sourceProcessors: this._byFilename[filename].slice()
      });
    }

    // Now check to see if a plugin registered for an extension. We prefer
    // longer extensions.
    const parts = filename.split('.');
    // don't use iteration functions, so we can return (and start at #1)
    for (let i = 1; i < parts.length; i++) {
      const extension = parts.slice(i).join('.');

      if (this._byExtension.hasOwnProperty(extension)) {
        return new SourceClassification('extension', {
          arch,
          extension,
          sourceProcessors: this._byExtension[extension]
        });
      }

      if (this._hardcodeJs && extension === 'js') {
        // If there is no special sourceProcessor for handling a .js file,
        // we can still classify it as extension/js, only without any
        // source processors. #HardcodeJs
        return new SourceClassification('extension', {
          extension,
          usesDefaultSourceProcessor: true
        });
      }

      if (this._legacyHandlers.hasOwnProperty(extension)) {
        const legacy = this._legacyHandlers[extension];
        if (legacy.archMatching &&
            ! archinfo.matches(arch, legacy.archMatching)) {
          return new SourceClassification('wrong-arch');
        }
        return new SourceClassification('legacy-handler', {
          extension,
          legacyHandler: legacy.handler,
          legacyIsTemplate: legacy.isTemplate
        });
      }
    }

    // Nothing matches; it must be a static asset (or a non-linted file).
    return new SourceClassification('unmatched');
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
    let addedJs = false;

    function addExtension(ext) {
      include.push(new RegExp('\\.' + utils.quotemeta(ext) + '$'));
      if (ext === 'js') {
        addedJs = true;
      }
    }

    _.each(this._byExtension, (sourceProcessors, ext) => {
      if (sourceProcessors.some(sp => sp.relevantForArch(arch))) {
        addExtension(ext);
      }
    });
    Object.keys(this._legacyHandlers).forEach(addExtension);

    if (this._hardcodeJs && ! addedJs) {
      // If there is no sourceProcessor for handling .js files, we still
      // want to make sure they get picked up when we're reading the
      // contents of app directories. #HardcodeJs
      addExtension('js');
    }

    _.each(this._byFilename, (sourceProcessors, filename) => {
      if (sourceProcessors.some(sp => sp.relevantForArch(arch))) {
        names.push(filename);
      }
    });
    return {include, names, exclude: []};
  }
}

class SourceClassification {
  constructor(type, {
    legacyHandler,
    extension,
    sourceProcessors,
    usesDefaultSourceProcessor,
    legacyIsTemplate,
    arch,
  } = {}) {
    const knownTypes = ['extension', 'filename', 'legacy-handler', 'wrong-arch',
                        'unmatched'];
    if (knownTypes.indexOf(type) === -1) {
      throw Error(`Unknown SourceClassification type ${ type }`);
    }
    // This is the only thing we can write to `this` before checking for
    // wrong-arch.
    this.type = type;

    if (type === 'extension' || type === 'filename') {
      if (sourceProcessors) {
        if (! arch) {
          throw Error("need to filter based on arch!");
        }

        // If there's a SourceProcessor (or legacy handler) registered for this
        // file but not for this arch, we want to ignore it instead of
        // processing it or treating it as a static asset. (Note that prior to
        // the batch-plugins project, files added in a package with
        // `api.addFiles('foo.bar')` where *.bar is a web-specific legacy
        // handler (eg) would end up adding 'foo.bar' as a static asset on
        // non-web programs, which was unintended. This didn't happen in apps
        // because initFromAppDir's getFiles never added them.)
        const filteredSourceProcessors = sourceProcessors.filter(
          (sourceProcessor) => sourceProcessor.relevantForArch(arch)
        );
        if (! filteredSourceProcessors.length) {
          // Wrong architecture! Rewrite this.type and return.  (Note that we
          // haven't written anything else to `this` so far.)
          this.type = 'wrong-arch';
          return;
        }

        this.sourceProcessors = filteredSourceProcessors;
      } else if (!(type === 'extension' && extension === 'js')) {
        // 'extension' and 'filename' classifications need to have at least one
        // SourceProcessor, unless it's the #HardcodeJs special case.
        throw Error(`missing sourceProcessors for ${ type }!`);
      }
    }

    if (type === 'legacy-handler') {
      if (! legacyHandler) {
        throw Error('SourceClassification needs legacyHandler!');
      }
      if (legacyIsTemplate === undefined) {
        throw Error('SourceClassification needs legacyIsTemplate!');
      }
      this.legacyHandler = legacyHandler;
      this.legacyIsTemplate = legacyIsTemplate;
    }

    if (type === 'extension' || type === 'legacy-handler') {
      if (! extension) {
        throw Error('extension SourceClassification needs extension!');
      }
      this.extension = extension;
    }

    if (usesDefaultSourceProcessor) {
      if (this.extension !== 'js' &&
          this.extension !== 'css') {
        // We only currently hard-code support for processing .js files
        // when no source processor is registered (#HardcodeJs). Default
        // support could conceivably be extended to .css files too, but
        // anything else is almost certainly a mistake.
        throw Error('non-JS/CSS file relying on default source processor?');
      }
      this.usesDefaultSourceProcessor = true;
    } else {
      this.usesDefaultSourceProcessor = false;
    }
  }

  isNonLegacySource() {
    return this.type === 'extension' || this.type === 'filename';
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
   * @summary Returns the architecture that is targeted while processing this
   * file.
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
    var path = self.getPathInPackage();
    var packageName = self.getPackageName();
    if (packageName) {
      path = "packages/" + packageName + "/" + path;
    }

    buildmessage.error(options.message || ("error building " + path), {
      file: options.sourcePath || path,
      line: options.line ? options.line : undefined,
      column: options.column ? options.column : undefined,
      func: options.func ? options.func : undefined
    });
  }
});
