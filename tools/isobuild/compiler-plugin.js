var archinfo = require('../utils/archinfo');
var buildmessage = require('../utils/buildmessage.js');
var buildPluginModule = require('./build-plugin.js');
var colonConverter = require('../utils/colon-converter.js');
var files = require('../fs/files');
var compiler = require('./compiler.js');
var linker = require('./linker.js');
var _ = require('underscore');
var Profile = require('../tool-env/profile').Profile;
import assert from "assert";
import {
  WatchSet,
  sha1,
  readAndWatchFileWithHash,
} from  '../fs/watch';
import LRU from 'lru-cache';
import {sourceMapLength} from '../utils/utils.js';
import {Console} from '../console/console.js';
import ImportScanner from './import-scanner';
import {cssToCommonJS} from "./css-modules";
import Resolver from "./resolver";
import {
  optimisticStatOrNull,
  optimisticHashOrNull,
} from "../fs/optimistic";

import { isTestFilePath } from './test-files.js';

const hasOwn = Object.prototype.hasOwnProperty;

// This file implements the new compiler plugins added in Meteor 1.2, which are
// registered with the Plugin.registerCompiler API.
//
// Unlike legacy source handlers (Plugin.registerSourceHandler), compilers run
// in the context of an entire app. That is to say, they don't run when you run
// `meteor publish`; whenever they run, they have access to all the files of
// their type across all packages as well as the app. This allows them to
// implement cross-file and cross-package inclusion, or config files in the app
// that affect how packages are processed, among other possibilities.
//
// Compilers can specify which extensions or filenames they process. They only
// process files in packages (or the app) that directly use the plugin's package
// (or that use it indirectly via the "imply" directive); just because compiler
// plugins act on multiple packages at a time doesn't mean they automatically
// act on all packages in your app.
//
// The CompilerPluginProcessor is the main entry point to this file; it is used
// by the bundler to run all plugins on a target. It doesn't have much
// interesting state and perhaps could have just been a function.
//
// It receives an ordered list of unibuilds (essentially, packages) from the
// bundler. It turns them into an ordered list of PackageSourceBatch objects,
// each of which represents the source files in a single package. Each
// PackageSourceBatch consists of an ordered list of ResourceSlots representing
// the resources in that package. The idea here is that, because Meteor executes
// all JS files in the order produced by the bundler, we need to make sure to
// maintain the order of packages from the bundler and the order of source files
// within a package. Each ResourceSlot represents a resource (either a 'source'
// resource which will be processed by a compiler plugin, or something else like
// a static asset or some JavaScript produced by a legacy source handler), and
// when the compiler plugin calls something like `inputFile.addJavaScript` on a
// file, we replace that source file with the resource produced by the plugin.
//
// InputFile is a wrapper around ResourceSlot that is the object presented to
// the compiler in the plugin. It is part of the documented registerCompiler
// API.

// Cache the (slightly post-processed) results of linker.fullLink.
const CACHE_SIZE = process.env.METEOR_LINKER_CACHE_SIZE || 1024*1024*100;
const CACHE_DEBUG = !! process.env.METEOR_TEST_PRINT_LINKER_CACHE_DEBUG;
const LINKER_CACHE_SALT = 24; // Increment this number to force relinking.
const LINKER_CACHE = new LRU({
  max: CACHE_SIZE,
  // Cache is measured in bytes. We don't care about servePath.
  // Key is JSONification of all options plus all hashes.
  length: function (files) {
    return files.reduce((soFar, current) => {
      return soFar + current.data.length + sourceMapLength(current.sourceMap);
    }, 0);
  }
});

const serverLibPackages = {
  // Make sure fibers is defined, if nothing else.
  fibers: true
};

function populateServerLibPackages() {
  const devBundlePath = files.getDevBundle();
  const nodeModulesPath = files.pathJoin(
    devBundlePath, "server-lib", "node_modules"
  );

  files.readdir(nodeModulesPath).forEach(packageName => {
    const packagePath = files.pathJoin(nodeModulesPath, packageName);
    const packageStat = files.statOrNull(packagePath);
    if (packageStat && packageStat.isDirectory()) {
      serverLibPackages[packageName] = true;
    }
  });
}

try {
  populateServerLibPackages();
} catch (e) {
  // At least we tried!
}

export class CompilerPluginProcessor {
  constructor({
    unibuilds,
    arch,
    sourceRoot,
    buildMode,
    isopackCache,
    linkerCacheDir,
    scannerCacheDir,
    minifyCssResource,
  }) {
    Object.assign(this, {
      unibuilds,
      arch,
      sourceRoot,
      buildMode,
      isopackCache,
      linkerCacheDir,
      scannerCacheDir,
      minifyCssResource,
    });

    if (linkerCacheDir) {
      files.mkdir_p(linkerCacheDir);
    }

    if (scannerCacheDir) {
      files.mkdir_p(scannerCacheDir);
    }
  }

  runCompilerPlugins() {
    const self = this;
    buildmessage.assertInJob();

    // plugin id -> {sourceProcessor, resourceSlots}
    var sourceProcessorsWithSlots = {};

    var sourceBatches = _.map(self.unibuilds, function (unibuild) {
      const { pkg: { name }, arch } = unibuild;
      const sourceRoot = name
        && self.isopackCache.getSourceRoot(name, arch)
        || self.sourceRoot;

      return new PackageSourceBatch(unibuild, self, {
        sourceRoot,
        linkerCacheDir: self.linkerCacheDir,
        scannerCacheDir: self.scannerCacheDir,
      });
    });

    // If we failed to match sources with processors, we're done.
    if (buildmessage.jobHasMessages()) {
      return [];
    }

    // Find out which files go with which CompilerPlugins.
    _.each(sourceBatches, function (sourceBatch) {
      _.each(sourceBatch.resourceSlots, function (resourceSlot) {
        var sourceProcessor = resourceSlot.sourceProcessor;
        // Skip non-sources.
        if (! sourceProcessor) {
          return;
        }

        if (! _.has(sourceProcessorsWithSlots, sourceProcessor.id)) {
          sourceProcessorsWithSlots[sourceProcessor.id] = {
            sourceProcessor: sourceProcessor,
            resourceSlots: []
          };
        }
        sourceProcessorsWithSlots[sourceProcessor.id].resourceSlots.push(
          resourceSlot);
      });
    });

    // Now actually run the handlers.
    _.each(sourceProcessorsWithSlots, function (data, id) {
      var sourceProcessor = data.sourceProcessor;
      var resourceSlots = data.resourceSlots;

      var jobTitle = [
        "processing files with ",
        sourceProcessor.isopack.name,
        " (for target ", self.arch, ")"
      ].join('');

      Profile.time("plugin "+sourceProcessor.isopack.name, () => {
        buildmessage.enterJob({
          title: jobTitle
        }, function () {
          var inputFiles = _.map(resourceSlots, function (resourceSlot) {
            return new InputFile(resourceSlot);
          });

          const markedMethod = buildmessage.markBoundary(
            sourceProcessor.userPlugin.processFilesForTarget,
            sourceProcessor.userPlugin
          );

          try {
            Promise.await(markedMethod(inputFiles));
          } catch (e) {
            buildmessage.exception(e);
          }
        });
      });
    });

    return sourceBatches;
  }
}

class InputFile extends buildPluginModule.InputFile {
  constructor(resourceSlot) {
    super();
    // We use underscored attributes here because this is user-visible
    // code and we don't want users to be accessing anything that we don't
    // document.
    this._resourceSlot = resourceSlot;

    // Map from absolute paths to stat objects (or null if the file does
    // not exist).
    this._statCache = Object.create(null);

    // Map from control file names (e.g. package.json, .babelrc) to
    // absolute paths, or null to indicate absence.
    this._controlFileCache = Object.create(null);

    // Map from imported module identifier strings (possibly relative) to
    // fully require.resolve'd module identifiers.
    this._resolveCache = Object.create(null);

    // Communicate to compiler plugins that methods like addJavaScript
    // accept a lazy finalizer function as a second argument, so that
    // compilation can be avoided until/unless absolutely necessary.
    this.supportsLazyCompilation = true;
  }

  getContentsAsBuffer() {
    var self = this;
    return self._resourceSlot.inputResource.data;
  }

  getPackageName() {
    var self = this;
    return self._resourceSlot.packageSourceBatch.unibuild.pkg.name;
  }

  isPackageFile() {
    return !! this.getPackageName();
  }

  isApplicationFile() {
    return ! this.getPackageName();
  }

  getSourceRoot(tolerant = false) {
    const sourceRoot = this._resourceSlot.packageSourceBatch.sourceRoot;

    if (_.isString(sourceRoot)) {
      return sourceRoot;
    }

    if (! tolerant) {
      const name = this.getPackageName();
      throw new Error(
        "Unknown source root for " + (
          name ? "package " + name : "app"));
    }

    return null;
  }

  getPathInPackage() {
    var self = this;
    return self._resourceSlot.inputResource.path;
  }

  getFileOptions() {
    // XXX fileOptions only exists on some resources (of type "source"). The JS
    // resources might not have this property.
    const { inputResource } = this._resourceSlot;
    return inputResource.fileOptions || (inputResource.fileOptions = {});
  }

  hmrAvailable() {
    const fileOptions = this.getFileOptions() || {};

    return this._resourceSlot.hmrAvailable() && !fileOptions.bare;
  }

  readAndWatchFileWithHash(path) {
    const sourceBatch = this._resourceSlot.packageSourceBatch;
    return readAndWatchFileWithHash(
      sourceBatch.unibuild.watchSet,
      files.convertToPosixPath(path),
    );
  }

  readAndWatchFile(path) {
    return this.readAndWatchFileWithHash(path).contents;
  }

  _stat(absPath) {
    return _.has(this._statCache, absPath)
      ? this._statCache[absPath]
      : this._statCache[absPath] = optimisticStatOrNull(absPath);
  }

  // Search ancestor directories for control files (e.g. package.json,
  // .babelrc), and return the absolute path of the first one found, or
  // null if the search failed.
  findControlFile(basename) {
    let absPath = this._controlFileCache[basename];
    if (typeof absPath === "string") {
      return absPath;
    }

    const sourceRoot = this.getSourceRoot(true);
    if (! _.isString(sourceRoot)) {
      return this._controlFileCache[basename] = null;
    }

    let dir = files.pathDirname(
      files.pathJoin(sourceRoot, this.getPathInPackage()));

    while (true) {
      absPath = files.pathJoin(dir, basename);

      const stat = this._stat(absPath);
      if (stat && stat.isFile()) {
        return this._controlFileCache[basename] = absPath;
      }

      if (files.pathBasename(dir) === "node_modules") {
        // The search for control files should not escape node_modules.
        return this._controlFileCache[basename] = null;
      }

      if (dir === sourceRoot) break;
      let parentDir = files.pathDirname(dir);
      if (parentDir === dir) break;
      dir = parentDir;
    }

    return this._controlFileCache[basename] = null;
  }

  _resolveCacheLookup(id, parentPath) {
    const byId = this._resolveCache[id];
    return byId && byId[parentPath];
  }

  _resolveCacheStore(id, parentPath, resolved) {
    let byId = this._resolveCache[id];
    if (! byId) {
      byId = this._resolveCache[id] = Object.create(null);
    }
    return byId[parentPath] = resolved;
  }

  resolve(id, parentPath) {
    parentPath = parentPath || files.pathJoin(
      this.getSourceRoot(),
      this.getPathInPackage()
    );

    const resId = this._resolveCacheLookup(id, parentPath);
    if (resId) {
      return resId;
    }

    const parentStat = optimisticStatOrNull(parentPath);
    if (! parentStat ||
        ! parentStat.isFile()) {
      throw new Error("Not a file: " + parentPath);
    }

    const batch = this._resourceSlot.packageSourceBatch;
    const resolver = batch.getResolver({
      // Make sure we use a server architecture when resolving, so that we
      // don't accidentally use package.json "browser" fields.
      // https://github.com/meteor/meteor/issues/9870
      targetArch: archinfo.host(),
    });
    const resolved = resolver.resolve(id, parentPath);

    if (resolved === "missing") {
      const error = new Error("Cannot find module '" + id + "'");
      error.code = "MODULE_NOT_FOUND";
      throw error;
    }

    return this._resolveCacheStore(id, parentPath, resolved.id);
  }

  require(id, parentPath) {
    return this._require(id, parentPath);
  }

  // This private helper method exists to prevent ambiguity between the
  // module-global `require` function and the method name.
  _require(id, parentPath) {
    return require(this.resolve(id, parentPath));
  }

  getArch() {
    return this._resourceSlot.packageSourceBatch.processor.arch;
  }

  getSourceHash() {
    return this._resourceSlot.inputResource.hash;
  }

  /**
   * @summary Returns the extension that matched the compiler plugin.
   * The longest prefix is preferred.
   * @returns {String}
   */
  getExtension() {
    return this._resourceSlot.inputResource.extension;
  }

  /**
   * @summary Returns a list of symbols declared as exports in this target. The
   * result of `api.export('symbol')` calls in target's control file such as
   * package.js.
   * @memberof InputFile
   * @returns {String[]}
   */
  getDeclaredExports() {
    var self = this;
    return self._resourceSlot.packageSourceBatch.unibuild.declaredExports;
  }

  /**
   * @summary Returns a relative path that can be used to form error messages or
   * other display properties. Can be used as an input to a source map.
   * @memberof InputFile
   * @returns {String}
   */
  getDisplayPath() {
    var self = this;
    return self._resourceSlot.packageSourceBatch.unibuild.pkg._getServePath(self.getPathInPackage());
  }

  /**
   * @summary Web targets only. Add a stylesheet to the document. Not available
   * for linter build plugins.
   * @param {Object} options
   * @param {String} options.path The requested path for the added CSS, may not
   * be satisfied if there are path conflicts.
   * @param {String} options.data The content of the stylesheet that should be
   * added.
   * @param {String|Object} options.sourceMap A stringified JSON
   * sourcemap, in case the stylesheet was generated from a different
   * file.
   * @param {Function} lazyFinalizer Optional function that can be called
   *                   to obtain any remaining options that may be
   *                   expensive to compute, and thus should only be
   *                   computed if/when we are sure this CSS will be used
   *                   by the application.
   * @memberOf InputFile
   * @instance
   */
  addStylesheet(options, lazyFinalizer) {
    this._resourceSlot.addStylesheet(options, lazyFinalizer);
  }

  /**
   * @summary Add JavaScript code. The code added will only see the
   * namespaces imported by this package as runtime dependencies using
   * ['api.use'](#PackageAPI-use). If the file being compiled was added
   * with the bare flag, the resulting JavaScript won't be wrapped in a
   * closure.
   * @param {Object} options
   * @param {String} options.path The path at which the JavaScript file
   * should be inserted, may not be honored in case of path conflicts.
   * @param {String} options.data The code to be added.
   * @param {String|Object} options.sourceMap A stringified JSON
   * sourcemap, in case the JavaScript file was generated from a
   * different file.
   * @param {Function} lazyFinalizer Optional function that can be called
   *                   to obtain any remaining options that may be
   *                   expensive to compute, and thus should only be
   *                   computed if/when we are sure this JavaScript will
   *                   be used by the application.
   * @memberOf InputFile
   * @instance
   */
  addJavaScript(options, lazyFinalizer) {
    this._resourceSlot.addJavaScript(options, lazyFinalizer);
  }

  /**
   * @summary Add a file to serve as-is to the browser or to include on
   * the browser, depending on the target. On the web, it will be served
   * at the exact path requested. For server targets, it can be retrieved
   * using `Assets.getText` or `Assets.getBinary`.
   * @param {Object} options
   * @param {String} options.path The path at which to serve the asset.
   * @param {Buffer|String} options.data The data that should be placed in the
   * file.
   * @param {String} [options.hash] Optionally, supply a hash for the output
   * file.
   * @param {Function} lazyFinalizer Optional function that can be called
   *                   to obtain any remaining options that may be
   *                   expensive to compute, and thus should only be
   *                   computed if/when we are sure this asset will be
   *                   used by the application.
   * @memberOf InputFile
   * @instance
   */
  addAsset(options, lazyFinalizer) {
    this._resourceSlot.addAsset(options, lazyFinalizer);
  }

  /**
   * @summary Works in web targets only. Add markup to the `head` or `body`
   * section of the document.
   * @param  {Object} options
   * @param {String} options.section Which section of the document should
   * be appended to. Can only be "head" or "body".
   * @param {String} options.data The content to append.
   * @param {Function} lazyFinalizer Optional function that can be called
   *                   to obtain any remaining options that may be
   *                   expensive to compute, and thus should only be
   *                   computed if/when we are sure this HTML will be used
   *                   by the application.
   * @memberOf InputFile
   * @instance
   */
  addHtml(options, lazyFinalizer) {
    if (typeof lazyFinalizer === "function") {
      // For now, just call the lazyFinalizer function immediately. Since
      // HTML is not compiled, this immediate invocation is probably
      // permanently appropriate for addHtml, whereas methods like
      // addJavaScript benefit from waiting to call lazyFinalizer.
      Object.assign(options, Promise.await(lazyFinalizer()));
    }

    this._resourceSlot.addHtml(options);
  }

  _reportError(message, info) {
    this._resourceSlot.addError(message, info);
    if (! this.getFileOptions().lazy) {
      super._reportError(message, info);
    }
  }
}

class ResourceSlot {
  constructor(unibuildResourceInfo,
              sourceProcessor,
              packageSourceBatch) {
    const self = this;
    // XXX ideally this should be an classy object, but it's not.
    self.inputResource = unibuildResourceInfo;
    // Everything but JS.
    self.outputResources = [];
    // JS, which gets linked together at the end.
    self.jsOutputResources = [];
    // Errors encountered while processing this resource.
    self.errors = [];
    self.sourceProcessor = sourceProcessor;
    self.packageSourceBatch = packageSourceBatch;

    if (self.inputResource.type === "source") {
      if (sourceProcessor) {
        // If we have a sourceProcessor, it will handle the adding of the
        // final processed JavaScript.
      } else if (self.inputResource.extension === "js") {
        self._addDirectlyToJsOutputResources();
      }
    } else {
      if (sourceProcessor) {
        throw Error("sourceProcessor for non-source? " +
                    JSON.stringify(unibuildResourceInfo));
      }
      // Any resource that isn't handled by compiler plugins just gets passed
      // through.
      if (self.inputResource.type === "js") {
        self._addDirectlyToJsOutputResources();
      } else {
        self.outputResources.push(self.inputResource);
      }
    }
  }

  // Add this resource directly to jsOutputResources without modifying the
  // original data. #HardcodeJs
  _addDirectlyToJsOutputResources() {
    this.addJavaScript({
      ...(this.inputResource.fileOptions || {}),
      path: this.inputResource.path,
      data: this.inputResource.data,
    });
  }

  _getOption(name, options) {
    if (options && _.has(options, name)) {
      return options[name];
    }
    const fileOptions = this.inputResource.fileOptions;
    return fileOptions && fileOptions[name];
  }

  _isLazy(options, isJavaScript) {
    let lazy = this._getOption("lazy", options);

    if (typeof lazy === "boolean") {
      return lazy;
    }

    const isApp = ! this.packageSourceBatch.unibuild.pkg.name;
    if (! isApp) {
      // Meteor package files must be explicitly added by api.addFiles or
      // api.mainModule, and are implicitly eager unless specified
      // otherwise via this.inputResource.fileOptions.lazy, which we
      // already checked above.
      return false;
    }

    // The rest of this method assumes we're considering a resource in an
    // application rather than a Meteor package.

    if (! this.packageSourceBatch.useMeteorInstall) {
      // If this application is somehow still not using the module system,
      // then everything is eagerly loaded.
      return false;
    }

    const {
      isTest = false,
      isAppTest = false,
    } = global.testCommandMetadata || {};

    const runningTests = isTest || isAppTest;

    if (isJavaScript) {
      if (runningTests) {
        const testModule = this._getOption("testModule", options);

        // If we set fileOptions.testModule = true in _inferFileOptions,
        // then consider this module an eager entry point for tests. If we
        // set it to false (rather than leaving it undefined), that means
        // a meteor.testModule was configured in package.json, and this
        // test module was not it. In that case, we fall through to the
        // mainModule check, ignoring isTestFilePath, because we can
        // assume this is not an eager test module. If testModule was not
        // set to a boolean, then isTestFilePath should determine if this
        // is an eager test module.
        const isEagerTestModule = typeof testModule === "boolean"
          ? testModule
          : isTestFilePath(this.inputResource.path);

        if (isEagerTestModule) {
          // If we know it's eager, then it isn't lazy.
          return false;
        }

        if (! isAppTest) {
          // If running `meteor test` without the --full-app option, then
          // any JS modules that are not eager test modules must be lazy.
          return true;
        }
      }

      // PackageSource#_inferFileOptions (in package-source.js) sets the
      // mainModule option to false to indicate that a meteor.mainModule
      // was configured for this architecture, but this module was not it.
      // It's important to wait until this point (ResourceSlot#_isLazy) to
      // make the final call, because we can finally tell whether the
      // output resource is JavaScript or not (non-JS resources are not
      // affected by the meteor.mainModule option).
      const mainModule = this._getOption("mainModule", options);
      if (typeof mainModule === "boolean") {
        return ! mainModule;
      }
    }

    // In other words, the imports directory remains relevant for non-JS
    // resources, and for JS resources in the absence of an explicit
    // meteor.mainModule configuration in package.json.
    const splitPath = this.inputResource.path.split(files.pathSep);
    const isInImports = splitPath.indexOf("imports") >= 0;
    return isInImports;
  }

  _isBare(options) {
    return !! this._getOption("bare", options);
  }

  hmrAvailable() {
    return this.packageSourceBatch.hmrAvailable;
  }

  addStylesheet(options, lazyFinalizer) {
    if (! this.sourceProcessor) {
      throw Error("addStylesheet on non-source ResourceSlot?");
    }

    // In contrast to addJavaScript, CSS resources passed to addStylesheet
    // default to being eager (non-lazy).
    options.lazy = this._isLazy(options, false);

    const cssResource = new CssOutputResource({
      resourceSlot: this,
      options,
      lazyFinalizer,
    });

    if (this.packageSourceBatch.useMeteorInstall &&
        cssResource.lazy) {
      // If the current packageSourceBatch supports modules, and this CSS
      // file is lazy, add it as a lazy JS module instead of adding it
      // unconditionally as a CSS resource, so that it can be imported
      // when needed.
      const jsResource = this.addJavaScript(options, () => {
        const result = {};

        let css = this.packageSourceBatch.processor
          .minifyCssResource(cssResource);

        if (! css && typeof css !== "string") {
          // The minifier didn't do anything, so we should use the
          // original contents of cssResource.data.
          css = cssResource.data.toString("utf8");

          if (cssResource.sourceMap) {
            // Add the source map as an asset, and append a
            // sourceMappingURL comment to the end of the CSS text that
            // will be dynamically inserted when/if this JS module is
            // evaluated at runtime. Note that this only happens when the
            // minifier did not modify the CSS, and thus does not happen
            // when we are building for production.
            const { servePath } = this.addAsset({
              path: jsResource.targetPath + ".map.json",
              data: JSON.stringify(cssResource.sourceMap)
            });
            css += "\n//# sourceMappingURL=" + servePath + "\n";
          }
        }

        result.data = Buffer.from(cssToCommonJS(css), "utf8");

        // The JavaScript module that dynamically loads this CSS should
        // not inherit the source map of the original CSS output.
        result.sourceMap = null;

        return result;
      });

    } else {
      // Eager CSS is added unconditionally to a combined <style> tag at
      // the beginning of the <head>. If the corresponding module ever
      // gets imported, its module.exports object should be an empty stub,
      // rather than a <style> node added dynamically to the <head>.
      this.addJavaScript({
        ...options,
        // As above, the JavaScript module that dynamically loads this CSS
        // should not inherit the source map of the original CSS output.
        sourceMap: null,
        data: Buffer.from(
          "// These styles have already been applied to the document.\n",
          "utf8"),
        lazy: true,
        // If a compiler plugin calls addJavaScript with the same
        // sourcePath, that code should take precedence over this empty
        // stub, so setting .implicit marks the resource as disposable.
      }).implicit = true;

      if (! cssResource.lazy &&
          ! Buffer.isBuffer(cssResource.data)) {
        // If there was an error processing this file, cssResource.data
        // will not be a Buffer, and accessing cssResource.data here
        // should cause the error to be reported via inputFile.error.
        return;
      }

      this.outputResources.push(cssResource);
    }
  }

  addJavaScript(options, lazyFinalizer) {
    // #HardcodeJs this gets called by constructor in the "js" case
    if (! this.sourceProcessor &&
        this.inputResource.extension !== "js" &&
        this.inputResource.type !== "js") {
      throw Error("addJavaScript on non-source ResourceSlot?");
    }

    const resource = new JsOutputResource({
      resourceSlot: this,
      options,
      lazyFinalizer,
    });

    this.jsOutputResources.push(resource);

    return resource;
  }

  addAsset(options, lazyFinalizer) {
    if (! this.sourceProcessor) {
      throw Error("addAsset on non-source ResourceSlot?");
    }

    const resource = new AssetOutputResource({
      resourceSlot: this,
      options,
      lazyFinalizer,
    });

    this.outputResources.push(resource);

    return resource;
  }

  addHtml(options) {
    const self = this;
    const unibuild = self.packageSourceBatch.unibuild;

    if (! archinfo.matches(unibuild.arch, "web")) {
      throw new Error("Document sections can only be emitted to " +
                      "web targets: " + self.inputResource.path);
    }
    if (options.section !== "head" && options.section !== "body") {
      throw new Error("'section' must be 'head' or 'body': " +
                      self.inputResource.path);
    }
    if (typeof options.data !== "string") {
      throw new Error("'data' option to appendDocument must be a string: " +
                      self.inputResource.path);
    }

    self.outputResources.push({
      type: options.section,
      data: Buffer.from(files.convertToStandardLineEndings(options.data), 'utf8'),
      lazy: self._isLazy(options, false),
    });
  }

  addError(message, info) {
    // If this file is ever actually imported, only then will we report
    // the error.
    this.errors.push({ message, info });
  }
}

class OutputResource {
  constructor({
    type,
    resourceSlot,
    options = Object.create(null),
    lazyFinalizer = null,
  }) {
    this._lazyFinalizer = lazyFinalizer;
    this._initialOptions = options;
    this._finalizerPromise = null;
    // Share the errors array of the resourceSlot.
    this._errors = resourceSlot.errors;

    let sourcePath = resourceSlot.inputResource.path;
    if (_.has(options, "sourcePath") &&
        typeof options.sourcePath === "string") {
      sourcePath = options.sourcePath;
    }

    const targetPath = options.path || sourcePath;
    const servePath = targetPath
      ? resourceSlot.packageSourceBatch.unibuild.pkg._getServePath(targetPath)
      : resourceSlot.inputResource.servePath;

    Object.assign(this, {
      type,
      lazy: resourceSlot._isLazy(options, true),
      bare: resourceSlot._isBare(options),
      mainModule: !! resourceSlot._getOption("mainModule", options),
      sourcePath,
      targetPath,
      servePath,
      sourceRoot: resourceSlot.packageSourceBatch.sourceRoot,
      // Remember the source hash so that changes to the source that
      // disappear after compilation can still contribute to the hash.
      // Bypassing SourceResource.hash getter so if the compiler plugin doesn't
      // use the resource's content we don't unnecessarily mark it as used.
      _inputHash: resourceSlot.inputResource._hash,
    });
  }

  finalize() {
    if (this._finalizerPromise) {
      this._finalizerPromise.await();
    } else if (this._lazyFinalizer) {
      const finalize = this._lazyFinalizer;
      this._lazyFinalizer = null;
      (this._finalizerPromise =
       // It's important to initialize this._finalizerPromise to the new
       // Promise before calling finalize(), so there's no possibility of
       // finalize() triggering code that reenters this function before we
       // have the final version of this._finalizerPromise. If this code
       // used `new Promise(resolve => resolve(finalize()))` instead of
       // `Promise.resolve().then(finalize)`, the finalize() call would
       // begin before this._finalizerPromise was fully initialized.
       Promise.resolve().then(finalize).then(result => {
         if (result) {
           Object.assign(this._initialOptions, result);
         } else if (this._errors.length === 0) {
           // In case the finalize() call failed without reporting any
           // errors, create at least one generic error that can be
           // reported when reportPendingErrors is called.
           const error = new Error("lazyFinalizer failed");
           error.info = { resource: this, finalize }
           this._errors.push(error);
         }
         // The this._finalizerPromise object only survives for the
         // duration of the initial finalization.
         this._finalizerPromise = null;
       })).await();
    }
  }

  hasPendingErrors() {
    this.finalize();
    return this._errors.length > 0;
  }

  reportPendingErrors() {
    if (this.hasPendingErrors()) {
      const firstError = this._errors[0];
      buildmessage.error(
        firstError.message,
        firstError.info
      );
    }
    return this._errors.length;
  }

  get data() { return this._get("data"); }
  set data(value) { return this._set("data", value); }

  get hash() { return this._get("hash"); }
  set hash(value) { return this._set("hash", value); }

  get sourceMap() { return this._get("sourceMap"); }
  set sourceMap(value) { return this._set("sourceMap", value); }

  // Method for getting properties that may be computed lazily, or that
  // require some one-time post-processing.
  _get(name) {
    if (hasOwn.call(this, name)) {
      return this[name];
    }

    if (this.hasPendingErrors()) {
      // If you're considering using this resource, you should call
      // hasPendingErrors or reportPendingErrors to find out if it's safe
      // to access computed properties like .data, .hash, or .sourceMap.
      // If you get here without checking for errors first, those errors
      // will be fatal.
      throw this._errors[0];
    }

    switch (name) {
    case "data":
      let { data = null } = this._initialOptions;
      if (typeof data === "string") {
        data = Buffer.from(data, "utf8");
      }
      return this._set("data", data);

    case "hash": {
      const hashes = [];

      if (typeof this._inputHash === "string") {
        hashes.push(this._inputHash);
      }

      hashes.push(sha1(this._get("data")));

      return this._set("hash", sha1(...hashes));
    }

    case "sourceMap":
      let { sourceMap } = this._initialOptions;
      if (sourceMap && typeof sourceMap === "string") {
        sourceMap = JSON.parse(sourceMap);
      }
      return this._set("sourceMap", sourceMap);
    }

    if (! hasOwn.call(this._initialOptions, name)) {
      throw new Error(`Unknown JsOutputResource property: ${name}`);
    }

    return this[name] = this._initialOptions[name];
  }

  // This method must be used to set any properties that have a getter
  // defined above (data, hash, sourceMap).
  _set(name, value) {
    Object.defineProperty(this, name, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    return value;
  }
}

class JsOutputResource extends OutputResource {
  constructor(params) {
    super({ ...params, type: "js" });
  }
}

class CssOutputResource extends OutputResource {
  constructor(params) {
    super({ ...params, type: "css" });
    this.refreshable = true;
  }
}

class AssetOutputResource extends OutputResource {
  constructor(params) {
    super({ ...params, type: "asset" });
    // Asset paths must always be explicitly specified.
    this.path = this._initialOptions.path;
    // Eagerness/laziness should never matter for assets.
    delete this.lazy;
  }
}

export class PackageSourceBatch {
  constructor(unibuild, processor, {
    sourceRoot,
    linkerCacheDir,
    scannerCacheDir,
  }) {
    const self = this;
    buildmessage.assertInJob();

    self.unibuild = unibuild;
    self.processor = processor;
    self.sourceRoot = sourceRoot;
    self.linkerCacheDir = linkerCacheDir;
    self.scannerCacheDir = scannerCacheDir;
    self.importExtensions = [".js", ".json"];
    self._nodeModulesPaths = null;

    self.resourceSlots = [];
    unibuild.resources.forEach(resource => {
      const slot = self.makeResourceSlot(resource);
      if (slot) {
        self.resourceSlots.push(slot);
      }
    });

    // Compute imports by merging the exports of all of the packages we
    // use. Note that in the case of conflicting symbols, later packages get
    // precedence.
    //
    // We don't get imports from unordered dependencies (since they
    // may not be defined yet) or from
    // weak/debugOnly/prodOnly/testOnly dependencies (because the
    // meaning of a name shouldn't be affected by the non-local
    // decision of whether or not an unrelated package in the target
    // depends on something).
    self.importedSymbolToPackageName = {}; // map from symbol to supplying package name

    compiler.eachUsedUnibuild({
      dependencies: self.unibuild.uses,
      arch: self.processor.arch,
      isopackCache: self.processor.isopackCache,
      skipUnordered: true,
      // don't import symbols from debugOnly, prodOnly and testOnly packages, because
      // if the package is not linked it will cause a runtime error.
      // the code must access them with `Package["my-package"].MySymbol`.
      skipDebugOnly: true,
      skipProdOnly: true,
      skipTestOnly: true,
    }, depUnibuild => {
      _.each(depUnibuild.declaredExports, function (symbol) {
        // Slightly hacky implementation of test-only exports.
        if (! symbol.testOnly || self.unibuild.pkg.isTest) {
          self.importedSymbolToPackageName[symbol.name] = depUnibuild.pkg.name;
        }
      });
    });

    self.useMeteorInstall =
      _.isString(self.sourceRoot) &&
      self.processor.isopackCache.uses(
        self.unibuild.pkg,
        "modules",
        self.unibuild.arch
      );

    const isDevelopment = self.processor.buildMode === 'development';
    const usesHMRPackage = self.unibuild.pkg.name !== "hot-module-replacement" &&
      self.processor.isopackCache.uses(
        self.unibuild.pkg,
        "hot-module-replacement",
        self.unibuild.arch
      );
    const supportedArch = archinfo.matches(self.unibuild.arch, 'web');

    self.hmrAvailable = self.useMeteorInstall && isDevelopment
      && usesHMRPackage && supportedArch;

    // These are the options that should be passed as the second argument
    // to meteorInstall when modules in this source batch are installed.
    self.meteorInstallOptions = self.useMeteorInstall ? {
      extensions: self.importExtensions,
    } : null;
  }

  compileOneJsResource(resource) {
    const slot = this.makeResourceSlot({
      type: "source",
      extension: "js",
      // Need { data, path, hash } here, at least.
      ...resource,
      fileOptions: {
        lazy: true,
        ...resource.fileOptions,
      }
    });

    if (slot) {
      // If the resource was not handled by a source processor, it will be
      // added directly to slot.jsOutputResources by makeResourceSlot,
      // meaning we do not need to compile it.
      if (slot.jsOutputResources.length > 0) {
        return slot.jsOutputResources
      }

      const inputFile = new InputFile(slot);
      inputFile.supportsLazyCompilation = false;

      if (slot.sourceProcessor) {
        const { userPlugin } = slot.sourceProcessor;
        if (userPlugin) {
          const markedMethod = buildmessage.markBoundary(
            userPlugin.processFilesForTarget,
            userPlugin
          );
          try {
            Promise.await(markedMethod([inputFile]));
          } catch (e) {
            buildmessage.exception(e);
          }
        }
      }

      return slot.jsOutputResources;
    }

    return [];
  }

  makeResourceSlot(resource) {
    let sourceProcessor = null;
    if (resource.type === "source") {
      var extension = resource.extension;
      if (extension === null) {
        const filename = files.pathBasename(resource.path);
        sourceProcessor = this._getSourceProcessorSet().getByFilename(filename);
        if (! sourceProcessor) {
          buildmessage.error(
            `no plugin found for ${ resource.path } in ` +
              `${ this.unibuild.pkg.displayName() }; a plugin for ${ filename } ` +
              `was active when it was published but none is now`);
          return null;
          // recover by ignoring
        }
      } else {
        sourceProcessor = this._getSourceProcessorSet().getByExtension(extension);
        // If resource.extension === 'js', it's ok for there to be no
        // sourceProcessor, since we #HardcodeJs in ResourceSlot.
        if (! sourceProcessor && extension !== 'js') {
          buildmessage.error(
            `no plugin found for ${ resource.path } in ` +
              `${ this.unibuild.pkg.displayName() }; a plugin for *.${ extension } ` +
              `was active when it was published but none is now`);
          return null;
          // recover by ignoring
        }

        this.addImportExtension(extension);
      }
    }

    return new ResourceSlot(resource, sourceProcessor, this);
  }

  addImportExtension(extension) {
    extension = extension.toLowerCase();

    if (! extension.startsWith(".")) {
      extension = "." + extension;
    }

    if (this.importExtensions.indexOf(extension) < 0) {
      this.importExtensions.push(extension);
    }
  }

  getResolver(options = {}) {
    return Resolver.getOrCreate({
      caller: "PackageSourceBatch#getResolver",
      sourceRoot: this.sourceRoot,
      targetArch: this.processor.arch,
      extensions: this.importExtensions,
      nodeModulesPaths: this._getNodeModulesPaths(),
      ...options,
    });
  }

  _getNodeModulesPaths() {
    if (! this._nodeModulesPaths) {
      const nmds = this.unibuild.nodeModulesDirectories;
      this._nodeModulesPaths = [];

      _.each(nmds, (nmd, path) => {
        if (! nmd.local) {
          this._nodeModulesPaths.push(
            files.convertToOSPath(path.replace(/\/$/g, "")));
        }
      });
    }

    return this._nodeModulesPaths;
  }

  _getSourceProcessorSet() {
    if (! this._sourceProcessorSet) {
      buildmessage.assertInJob();

      const isopack = this.unibuild.pkg;
      const activePluginPackages = compiler.getActivePluginPackages(isopack, {
        uses: this.unibuild.uses,
        isopackCache: this.processor.isopackCache
      });

      this._sourceProcessorSet = new buildPluginModule.SourceProcessorSet(
        isopack.displayName(), { hardcodeJs: true });

      _.each(activePluginPackages, otherPkg => {
        otherPkg.ensurePluginsInitialized();
        this._sourceProcessorSet.merge(otherPkg.sourceProcessors.compiler, {
          arch: this.processor.arch,
        });
      });
    }

    return this._sourceProcessorSet;
  }

  // Returns a map from package names to arrays of JS output files.
  static computeJsOutputFilesMap(sourceBatches) {
    const map = new Map;

    sourceBatches.forEach(batch => {
      const name = batch.unibuild.pkg.name || null;
      const inputFiles = [];

      batch.resourceSlots.forEach(slot => {
        inputFiles.push(...slot.jsOutputResources);
      });

      map.set(name, {
        files: inputFiles,
        mainModule: _.find(inputFiles, file => file.mainModule) || null,
        batch,
        importScannerWatchSet: new WatchSet(),
      });
    });

    if (! map.has("modules")) {
      // In the unlikely event that no package is using the modules
      // package, then the map is already complete, and we don't need to
      // do any import scanning.
      return this._watchOutputFiles(map);
    }

    // Append install(<name>) calls to the install-packages.js file in the
    // modules package for every Meteor package name used.
    map.get("modules").files.some(file => {
      if (file.sourcePath !== "install-packages.js") {
        return false;
      }

      const meteorPackageInstalls = [];

      map.forEach((info, name) => {
        if (! name) return;

        const mainModule = info.mainModule &&
          `meteor/${name}/${info.mainModule.targetPath}`;

        meteorPackageInstalls.push(
          "install(" + JSON.stringify(name) +
            (mainModule ? ", " + JSON.stringify(mainModule) : '') +
          ");\n"
        );
      });

      if (meteorPackageInstalls.length === 0) {
        return false;
      }

      file.data = Buffer.from(
        file.data.toString("utf8") + "\n" +
          meteorPackageInstalls.join(""),
        "utf8"
      );

      file.hash = sha1(file.data);

      return true;
    });

    // Map from module identifiers that previously could not be imported
    // to lists of info objects describing the failed imports.
    const allMissingModules = Object.create(null);

    // Records the subset of allMissingModules that were successfully
    // relocated to a source batch that could handle them.
    const allRelocatedModules = Object.create(null);
    const scannerMap = new Map;

    sourceBatches.forEach(batch => {
      const name = batch.unibuild.pkg.name || null;
      const isApp = ! name;

      if (! batch.useMeteorInstall && ! isApp) {
        // If this batch represents a package that does not use the module
        // system, then we don't need to scan its dependencies.
        return;
      }

      const nodeModulesPaths = [];
      _.each(batch.unibuild.nodeModulesDirectories, (nmd, sourcePath) => {
        if (! nmd.local) {
          // Local node_modules directories will be found by the
          // ImportScanner, but we need to tell it about any external
          // node_modules directories (e.g. .npm/package/node_modules).
          nodeModulesPaths.push(sourcePath);
        }
      });

      const entry = map.get(name);

      const scanner = new ImportScanner({
        name,
        bundleArch: batch.processor.arch,
        extensions: batch.importExtensions,
        sourceRoot: batch.sourceRoot,
        nodeModulesPaths,
        watchSet: entry.importScannerWatchSet,
        cacheDir: batch.scannerCacheDir,
      });

      scanner.addInputFiles(entry.files);

      if (batch.useMeteorInstall) {
        scanner.scanImports();
        ImportScanner.mergeMissing(
          allMissingModules,
          scanner.allMissingModules
        );
      }

      scannerMap.set(name, scanner);
    });

    function handleMissing(missingModules) {
      const missingMap = new Map;

      _.each(missingModules, (importInfoList, id) => {
        const parts = id.split("/");
        let name = null;

        if (parts[0] === "meteor") {
          let found = false;
          name = parts[1];

          if (parts.length > 2) {
            parts[1] = ".";
            id = parts.slice(1).join("/");
            found = true;

          } else {
            const entry = map.get(name);
            const mainModule = entry && entry.mainModule;
            if (mainModule) {
              id = "./" + mainModule.sourcePath;
              found = true;
            }
          }

          if (! found) {
            return;
          }
        }

        if (! scannerMap.has(name)) {
          return;
        }

        if (! missingMap.has(name)) {
          missingMap.set(name, Object.create(null));
        }

        ImportScanner.mergeMissing(
          missingMap.get(name),
          { [id]: importInfoList }
        );
      });

      const nextMissingModules = Object.create(null);

      missingMap.forEach((missing, name) => {
        const { newlyAdded, newlyMissing } =
          scannerMap.get(name).scanMissingModules(missing);
        ImportScanner.mergeMissing(allRelocatedModules, newlyAdded);
        ImportScanner.mergeMissing(nextMissingModules, newlyMissing);
      });

      if (! _.isEmpty(nextMissingModules)) {
        handleMissing(nextMissingModules);
      }
    }

    handleMissing(allMissingModules);

    Object.keys(allRelocatedModules).forEach(id => {
      delete allMissingModules[id];
    });

    this._warnAboutMissingModules(allMissingModules);

    scannerMap.forEach((scanner, name) => {
      const isApp = ! name;
      const outputFiles = scanner.getOutputFiles();
      const entry = map.get(name);

      if (entry.batch.useMeteorInstall) {
        outputFiles.forEach(file => {
          // Give every file the same meteorInstallOptions object, so the
          // linker can emit one meteorInstall call per options object.
          file.meteorInstallOptions = entry.batch.meteorInstallOptions;
        });
      }

      if (isApp) {
        const appFilesWithoutNodeModules = [];
        const modulesEntry = map.get("modules");

        outputFiles.forEach(file => {
          const parts = file.absModuleId.split("/");
          assert.strictEqual(parts[0], "");
          const nodeModulesIndex = parts.indexOf("node_modules");

          if (nodeModulesIndex === -1 || (nodeModulesIndex === 1 &&
                                          parts[2] === "meteor")) {
            appFilesWithoutNodeModules.push(file);
          } else {
            // There's a chance the application does not use the module
            // system, which means entry.batch.useMeteorInstall will be
            // false and file.meteorInstallOptions will not have been
            // defined above. In that case, just use meteorInstallOptions
            // from the modules source batch, since we're moving this file
            // into the modules bundle.
            file.meteorInstallOptions = file.meteorInstallOptions ||
              modulesEntry.batch.meteorInstallOptions;

            // This file is going to be installed in a node_modules
            // directory, so we move it to the modules bundle so that it
            // can be imported by any package that uses the modules
            // package. Note that this includes all files within any
            // node_modules directory in the app, even though packages in
            // client/node_modules will not be importable by Meteor
            // packages, because it's important for all npm packages in
            // the app to share the same limited scope (i.e. the scope of
            // the modules package). However, these relocated files have
            // their own meteorInstallOptions, and will be installed with
            // a separate call to meteorInstall in the modules bundle.
            modulesEntry.files.push(file);
          }
        });

        entry.files = appFilesWithoutNodeModules;

      } else {
        entry.files = outputFiles;
      }
    });

    return this._watchOutputFiles(map);
  }

  static _watchOutputFiles(jsOutputFilesMap) {
    // Watch all output files produced by computeJsOutputFilesMap.
    jsOutputFilesMap.forEach(entry => {
      entry.files.forEach(file => {
        // Output resources are not directly marked as definitely used. Instead,
        // its input resource might be if its content was used by a build plugin.
        // This is checked in Target#_emitResources
        if (file instanceof OutputResource) {
          return;
        }

        const {
          sourcePath,
          absPath = sourcePath &&
            files.pathJoin(entry.batch.sourceRoot, sourcePath),
        } = file;
        const { importScannerWatchSet } = entry;
        if (
          typeof absPath === "string" &&
          // Blindly calling importScannerWatchSet.addFile would be
          // logically correct here, but we can save the cost of calling
          // optimisticHashOrNull(absPath) if the importScannerWatchSet
          // already knows about the file and it has not been marked as
          // potentially unused.
          ! importScannerWatchSet.isDefinitelyUsed(absPath)
        ) {
          // If this file was previously added to the importScannerWatchSet
          // using the addPotentiallyUnusedFile method (see compileUnibuild),
          // calling addFile here will update its usage status to reflect that
          // the ImportScanner did, in fact, end up "using" the file.
          importScannerWatchSet.addFile(absPath, optimisticHashOrNull(absPath));
        }
      });
    });
    return jsOutputFilesMap;
  }

  static _warnAboutMissingModules(missingModules) {
    const topLevelMissingIDs = {};
    const warnings = [];

    Object.keys(missingModules).forEach(id => {
      // Issue at most one warning per module identifier, even if there
      // are multiple parent modules that failed to import it.
      missingModules[id].some(info => maybeWarn(id, info));
    });

    function maybeWarn(id, info) {
      if (info.packageName) {
        // Silence warnings generated by Meteor packages, since package
        // authors can be trusted to test their packages, and may have
        // different/better approaches to ensuring their dependencies are
        // available. This blanket check makes some of the checks below
        // redundant, but I would rather create a bit of dead code than
        // risk introducing bugs when/if this check is reverted.
        return;
      }

      if (info.possiblySpurious) {
        // Silence warnings for missing dependencies in Browserify/Webpack
        // bundles, since we can reasonably conclude at this point that
        // they are false positives.
        return;
      }

      if (id in serverLibPackages &&
          archinfo.matches(info.bundleArch, "os")) {
        // Packages in dev_bundle/server-lib/node_modules can always be
        // resolved at runtime on the server, so we don't need to warn
        // about them here.
        return;
      }

      if (id === "meteor-node-stubs" &&
          info.packageName === "modules" &&
          info.parentPath.endsWith("stubs.js")) {
        // Don't warn about the require("meteor-node-stubs") call in
        // packages/modules/stubs.js.
        return;
      }

      const parts = id.split("/");

      if ("./".indexOf(id.charAt(0)) < 0) {
        const packageDir = parts[0].startsWith("@")
          ? parts[0] + "/" + parts[1]
          : parts[0];

        if (packageDir === "meteor") {
          // Don't print warnings for uninstalled Meteor packages.
          return;
        }

        if (! _.has(topLevelMissingIDs, packageDir)) {
          // This information will be used to recommend installing npm
          // packages below.
          topLevelMissingIDs[packageDir] = id;
        }

        if (id.startsWith("meteor-node-stubs/deps/")) {
          // Instead of printing a warning that meteor-node-stubs/deps/fs
          // is missing, warn about the "fs" module, but still recommend
          // installing meteor-node-stubs via npm below.
          id = parts.slice(2).join("/");
        }

      } else if (info.packageName) {
        // Disable warnings about relative module resolution failures in
        // Meteor packages, since there's not much the application
        // developer can do about those.
        return;
      }

      warnings.push(`  ${JSON.stringify(id)} in ${
        info.parentPath} (${info.bundleArch})`);

      return true;
    }

    if (warnings.length > 0) {
      Console.rawWarn("\nUnable to resolve some modules:\n\n");
      warnings.forEach(text => Console.warn(text));
      Console.warn();

      const topLevelKeys = Object.keys(topLevelMissingIDs);
      if (topLevelKeys.length > 0) {
        Console.warn("If you notice problems related to these missing modules, consider running:");
        Console.warn();
        Console.warn("  meteor npm install --save " + topLevelKeys.join(" "));
        Console.warn();
      }
    }
  }

  // Called by bundler's Target._emitResources.  It returns the actual resources
  // that end up in the program for this package.  By this point, it knows what
  // its dependencies are and what their exports are, so it can set up
  // linker-style imports and exports.
  getResources(jsResources, onCacheKey) {
    buildmessage.assertInJob();

    const resources = [];

    this.resourceSlots.forEach(slot => {
      resources.push(...slot.outputResources);
    });

    resources.push(...this._linkJS(jsResources, onCacheKey));

    return resources;
  }

  _linkJS(jsResources, onCacheKey = () => {}) {
    const self = this;
    buildmessage.assertInJob();

    var bundleArch = self.processor.arch;

    // Run the linker.
    const isApp = ! self.unibuild.pkg.name;
    const isWeb = archinfo.matches(self.unibuild.arch, "web");
    const linkerOptions = {
      isApp,
      bundleArch,
      // I was confused about this, so I am leaving a comment -- the
      // combinedServePath is either [pkgname].js or [pluginName]:plugin.js.
      // XXX: If we change this, we can get rid of source arch names!
      combinedServePath: isApp ? "/app.js" :
        "/packages/" + colonConverter.convert(
          self.unibuild.pkg.name +
            (self.unibuild.kind === "main" ? "" : (":" + self.unibuild.kind)) +
            ".js"),
      name: self.unibuild.pkg.name || null,
      declaredExports: _.pluck(self.unibuild.declaredExports, 'name'),
      imports: self.importedSymbolToPackageName,
      // XXX report an error if there is a package called global-imports
      includeSourceMapInstructions: isWeb,
    };

    const fileHashes = [];
    const cacheKeyPrefix = sha1(JSON.stringify({
      linkerOptions,
      files: jsResources.map((inputFile) => {
        fileHashes.push(inputFile.hash);
        return {
          meteorInstallOptions: inputFile.meteorInstallOptions,
          absModuleId: inputFile.absModuleId,
          sourceMap: !! inputFile.sourceMap,
          mainModule: inputFile.mainModule,
          imported: inputFile.imported,
          alias: inputFile.alias,
          lazy: inputFile.lazy,
          bare: inputFile.bare,
        };
      })
    }));
    const cacheKeySuffix = sha1(JSON.stringify({
      LINKER_CACHE_SALT,
      fileHashes
    }));
    const cacheKey = `${cacheKeyPrefix}_${cacheKeySuffix}`;
    onCacheKey(cacheKey, jsResources);

    if (LINKER_CACHE.has(cacheKey)) {
      if (CACHE_DEBUG) {
        console.log('LINKER IN-MEMORY CACHE HIT:',
                    linkerOptions.name, bundleArch);
      }
      return LINKER_CACHE.get(cacheKey);
    }

    const cacheFilename = self.linkerCacheDir &&
      files.pathJoin(self.linkerCacheDir, cacheKey + '.cache');

    const wildcardCacheFilename = cacheFilename &&
      files.pathJoin(self.linkerCacheDir, cacheKeyPrefix + "_*.cache");

    // The return value from _linkJS includes Buffers, but we want everything to
    // be JSON for writing to the disk cache. This function converts the string
    // version to the Buffer version.
    function bufferifyJSONReturnValue(resources) {
      resources.forEach((r) => {
        r.data = Buffer.from(r.data, 'utf8');
      });
    }

    if (cacheFilename) {
      let diskCached = null;
      try {
        diskCached = files.readJSONOrNull(cacheFilename);
      } catch (e) {
        // Ignore JSON parse errors; pretend there was no cache.
        if (!(e instanceof SyntaxError)) {
          throw e;
        }
      }
      if (diskCached && diskCached instanceof Array) {
        // Fix the non-JSON part of our return value.
        bufferifyJSONReturnValue(diskCached);
        if (CACHE_DEBUG) {
          console.log('LINKER DISK CACHE HIT:', linkerOptions.name, bundleArch);
        }
        // Add the bufferized value of diskCached to the in-memory LRU cache
        // so we don't have to go to disk next time.
        LINKER_CACHE.set(cacheKey, diskCached);
        return diskCached;
      }
    }

    if (CACHE_DEBUG) {
      console.log('LINKER CACHE MISS:', linkerOptions.name, bundleArch);
    }

    // nb: linkedFiles might be aliased to an entry in LINKER_CACHE, so don't
    // mutate anything from it.
    let canCache = true;
    let linkedFiles = null;
    buildmessage.enterJob('linking', () => {
      linkedFiles = linker.fullLink(jsResources, linkerOptions);
      if (buildmessage.jobHasMessages()) {
        canCache = false;
      }
    });
    // Add each output as a resource
    const ret = linkedFiles.map((file) => {
      const sm = (typeof file.sourceMap === 'string')
        ? JSON.parse(file.sourceMap) : file.sourceMap;
      return {
        type: "js",
        // This is a string... but we will convert it to a Buffer
        // before returning from the method (but after writing
        // to cache).
        data: file.source,
        hash: file.hash,
        servePath: file.servePath,
        sourceMap: sm
      };
    });

    let retAsJSON;
    if (canCache && cacheFilename) {
      retAsJSON = JSON.stringify(ret);
    }

    // Convert strings to buffers, now that we've serialized it.
    bufferifyJSONReturnValue(ret);

    if (canCache) {
      LINKER_CACHE.set(cacheKey, ret);
      if (cacheFilename) {
        // Write asynchronously.
        Promise.resolve().then(() => {
          try {
            files.rm_recursive(wildcardCacheFilename);
          } finally {
            files.writeFileAtomically(cacheFilename, retAsJSON);
          }
        });
      }
    }

    return ret;
  }
}

_.each([
  "getResources",
  "_linkJS",
], method => {
  const proto = PackageSourceBatch.prototype;
  proto[method] = Profile(
    "PackageSourceBatch#" + method,
    proto[method]
  );
});

// static methods to measure in profile
_.each([
  "computeJsOutputFilesMap",
  "_watchOutputFiles"
], method => {
  PackageSourceBatch[method] = Profile(
    "PackageSourceBatch." + method,
    PackageSourceBatch[method]);
});
