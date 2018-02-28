var archinfo = require('../utils/archinfo.js');
var buildmessage = require('../utils/buildmessage.js');
var buildPluginModule = require('./build-plugin.js');
var colonConverter = require('../utils/colon-converter.js');
var files = require('../fs/files.js');
var compiler = require('./compiler.js');
var linker = require('./linker.js');
var util = require('util');
var _ = require('underscore');
var Profile = require('../tool-env/profile.js').Profile;
import assert from "assert";
import {sha1, readAndWatchFileWithHash} from  '../fs/watch.js';
import LRU from 'lru-cache';
import {sourceMapLength} from '../utils/utils.js';
import {Console} from '../console/console.js';
import ImportScanner from './import-scanner.js';
import {cssToCommonJS} from "./css-modules.js";
import Resolver from "./resolver.js";
import {
  optimisticStatOrNull,
} from "../fs/optimistic.js";

import { isTestFilePath } from './test-files.js';

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
const LINKER_CACHE_SALT = 19; // Increment this number to force relinking.
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
    isopackCache,
    linkerCacheDir,
  }) {
    const self = this;

    self.unibuilds = unibuilds;
    self.arch = arch;
    self.sourceRoot = sourceRoot;
    self.isopackCache = isopackCache;

    self.linkerCacheDir = linkerCacheDir;
    if (self.linkerCacheDir) {
      files.mkdir_p(self.linkerCacheDir);
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
        linkerCacheDir: self.linkerCacheDir
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

          var markedMethod = buildmessage.markBoundary(
            sourceProcessor.userPlugin.processFilesForTarget.bind(
              sourceProcessor.userPlugin));

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
    var self = this;
    // XXX fileOptions only exists on some resources (of type "source"). The JS
    // resources might not have this property.
    return self._resourceSlot.inputResource.fileOptions || {};
  }

  readAndWatchFileWithHash(path) {
    const osPath = files.convertToOSPath(path);
    const sourceRoot = this.getSourceRoot();
    const relPath = files.pathRelative(sourceRoot, osPath);
    if (relPath.startsWith("..")) {
      throw new Error(
        `Attempting to read file outside ${
          this.getPackageName() || "the app"}: ${osPath}`
      );
    }
    const sourceBatch = this._resourceSlot.packageSourceBatch;
    return readAndWatchFileWithHash(
      sourceBatch.unibuild.watchSet,
      osPath
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
    const resolver = batch.getResolver();
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
   * @memberOf InputFile
   * @instance
   */
  addStylesheet(options) {
    var self = this;
    if (options.sourceMap && typeof options.sourceMap === 'string') {
      // XXX remove an anti-XSSI header? ")]}'\n"
      options.sourceMap = JSON.parse(options.sourceMap);
    }
    self._resourceSlot.addStylesheet(options);
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
   * @memberOf InputFile
   * @instance
   */
  addJavaScript(options) {
    var self = this;
    if (options.sourceMap && typeof options.sourceMap === 'string') {
      // XXX remove an anti-XSSI header? ")]}'\n"
      options.sourceMap = JSON.parse(options.sourceMap);
    }
    self._resourceSlot.addJavaScript(options);
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
   * @memberOf InputFile
   * @instance
   */
  addAsset(options) {
    var self = this;
    self._resourceSlot.addAsset(options);
  }

  /**
   * @summary Works in web targets only. Add markup to the `head` or `body`
   * section of the document.
   * @param  {Object} options
   * @param {String} options.section Which section of the document should
   * be appended to. Can only be "head" or "body".
   * @param {String} options.data The content to append.
   * @memberOf InputFile
   * @instance
   */
  addHtml(options) {
    var self = this;
    self._resourceSlot.addHtml(options);
  }

  _reportError(message, info) {
    if (this.getFileOptions().lazy === true) {
      // Files with fileOptions.lazy === true were not explicitly added to
      // the source batch via api.addFiles or api.mainModule, so any
      // compilation errors should not be fatal until the files are
      // actually imported by the ImportScanner. Attempting compilation is
      // still important for lazy files that might end up being imported
      // later, which is why we defang the error here, instead of avoiding
      // compilation preemptively. Note also that exceptions thrown by the
      // compiler will still cause build errors.
      this._resourceSlot.addError(message, info);
    } else {
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
    self.sourceProcessor = sourceProcessor;
    self.packageSourceBatch = packageSourceBatch;

    if (self.inputResource.type === "source") {
      if (sourceProcessor) {
        // If we have a sourceProcessor, it will handle the adding of the
        // final processed JavaScript.
      } else if (self.inputResource.extension === "js") {
        // If there is no sourceProcessor for a .js file, add the source
        // directly to the output. #HardcodeJs
        self.addJavaScript({
          // XXX it's a shame to keep converting between Buffer and string, but
          // files.convertToStandardLineEndings only works on strings for now
          data: self.inputResource.data.toString('utf8'),
          path: self.inputResource.path,
          hash: self.inputResource.hash,
          bare: self.inputResource.fileOptions &&
            (self.inputResource.fileOptions.bare ||
             // XXX eventually get rid of backward-compatibility "raw" name
             // XXX COMPAT WITH 0.6.4
             self.inputResource.fileOptions.raw)
        });
      }
    } else {
      if (sourceProcessor) {
        throw Error("sourceProcessor for non-source? " +
                    JSON.stringify(unibuildResourceInfo));
      }
      // Any resource that isn't handled by compiler plugins just gets passed
      // through.
      if (self.inputResource.type === "js") {
        let resource = self.inputResource;
        if (! _.isString(resource.sourcePath)) {
          resource.sourcePath = self.inputResource.path;
        }
        if (! _.isString(resource.targetPath)) {
          resource.targetPath = resource.sourcePath;
        }
        self.jsOutputResources.push(resource);
      } else {
        self.outputResources.push(self.inputResource);
      }
    }
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

  addStylesheet(options) {
    const self = this;
    if (! self.sourceProcessor) {
      throw Error("addStylesheet on non-source ResourceSlot?");
    }

    const data = files.convertToStandardLineEndings(options.data);
    const useMeteorInstall = self.packageSourceBatch.useMeteorInstall;
    const sourcePath = this.inputResource.path;
    const targetPath = options.path || sourcePath;
    const resource = {
      refreshable: true,
      sourcePath,
      targetPath,
      servePath: self.packageSourceBatch.unibuild.pkg._getServePath(targetPath),
      hash: sha1(data),
      lazy: this._isLazy(options, false),
    };

    if (useMeteorInstall && resource.lazy) {
      // If the current packageSourceBatch supports modules, and this CSS
      // file is lazy, add it as a lazy JS module instead of adding it
      // unconditionally as a CSS resource, so that it can be imported
      // when needed.
      resource.type = "js";
      resource.data =
        Buffer.from(cssToCommonJS(data, resource.hash), "utf8");

      self.jsOutputResources.push(resource);

    } else {
      // Eager CSS is added unconditionally to a combined <style> tag at
      // the beginning of the <head>. If the corresponding module ever
      // gets imported, its module.exports object should be an empty stub,
      // rather than a <style> node added dynamically to the <head>.
      self.jsOutputResources.push({
        ...resource,
        type: "js",
        data: Buffer.from(
          "// These styles have already been applied to the document.\n",
          "utf8"),
        // If a compiler plugin calls addJavaScript with the same
        // sourcePath, that code should take precedence over this empty
        // stub, so this property marks the resource as disposable.
        implicit: true,
        lazy: true,
      });

      resource.type = "css";
      resource.data = Buffer.from(data, 'utf8'),

      // XXX do we need to call convertSourceMapPaths here like we did
      //     in legacy handlers?
      resource.sourceMap = options.sourceMap;

      self.outputResources.push(resource);
    }
  }

  addJavaScript(options) {
    const self = this;
    // #HardcodeJs this gets called by constructor in the "js" case
    if (! self.sourceProcessor && self.inputResource.extension !== "js") {
      throw Error("addJavaScript on non-source ResourceSlot?");
    }

    let sourcePath = self.inputResource.path;
    if (_.has(options, "sourcePath") &&
        typeof options.sourcePath === "string") {
      sourcePath = options.sourcePath;
    }

    const targetPath = options.path || sourcePath;

    var data = Buffer.from(
      files.convertToStandardLineEndings(options.data), 'utf8');

    self.jsOutputResources.push({
      type: "js",
      data: data,
      sourcePath,
      targetPath,
      servePath: self.packageSourceBatch.unibuild.pkg._getServePath(targetPath),
      // XXX should we allow users to be trusted and specify a hash?
      hash: sha1(data),
      // XXX do we need to call convertSourceMapPaths here like we did
      //     in legacy handlers?
      sourceMap: options.sourceMap,
      // intentionally preserve a possible `undefined` value for files
      // in apps, rather than convert it into `false` via `!!`
      lazy: self._isLazy(options, true),
      bare: !! self._getOption("bare", options),
      mainModule: !! self._getOption("mainModule", options),
    });
  }

  addAsset(options) {
    const self = this;
    if (! self.sourceProcessor) {
      throw Error("addAsset on non-source ResourceSlot?");
    }

    if (! (options.data instanceof Buffer)) {
      if (_.isString(options.data)) {
        options.data = Buffer.from(options.data);
      } else {
        throw new Error("'data' option to addAsset must be a Buffer or " +
                        "String: " + self.inputResource.path);
      }
    }

    self.outputResources.push({
      type: 'asset',
      data: options.data,
      path: options.path,
      servePath: self.packageSourceBatch.unibuild.pkg._getServePath(
        options.path),
      hash: sha1(options.data),
      lazy: self._isLazy(options, false),
    });
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
    // the error. Use this.jsOutputResources because that's what the
    // ImportScanner deals with.
    this.jsOutputResources.push({
      type: "js",
      sourcePath: this.inputResource.path,
      targetPath: this.inputResource.path,
      servePath: this.inputResource.path,
      data: Buffer.from(
        "throw new Error(" + JSON.stringify(message) + ");\n",
        "utf8"),
      lazy: true,
      error: { message, info },
    });
  }
}

export class PackageSourceBatch {
  constructor(unibuild, processor, {
    sourceRoot,
    linkerCacheDir,
  }) {
    const self = this;
    buildmessage.assertInJob();

    self.unibuild = unibuild;
    self.processor = processor;
    self.sourceRoot = sourceRoot;
    self.linkerCacheDir = linkerCacheDir;
    self.importExtensions = [".js", ".json"];
    self._resolver = null;

    var sourceProcessorSet = self._getSourceProcessorSet();

    self.resourceSlots = [];
    unibuild.resources.forEach(function (resource) {
      let sourceProcessor = null;
      if (resource.type === "source") {
        var extension = resource.extension;
        if (extension === null) {
          const filename = files.pathBasename(resource.path);
          sourceProcessor = sourceProcessorSet.getByFilename(filename);
          if (! sourceProcessor) {
            buildmessage.error(
              `no plugin found for ${ resource.path } in ` +
                `${ unibuild.pkg.displayName() }; a plugin for ${ filename } ` +
                `was active when it was published but none is now`);
            return;
            // recover by ignoring
          }
        } else {
          sourceProcessor = sourceProcessorSet.getByExtension(extension);
          // If resource.extension === 'js', it's ok for there to be no
          // sourceProcessor, since we #HardcodeJs in ResourceSlot.
          if (! sourceProcessor && extension !== 'js') {
            buildmessage.error(
              `no plugin found for ${ resource.path } in ` +
                `${ unibuild.pkg.displayName() }; a plugin for *.${ extension } ` +
                `was active when it was published but none is now`);
            return;
            // recover by ignoring
          }

          self.addImportExtension(extension);
        }
      }

      self.resourceSlots.push(new ResourceSlot(resource, sourceProcessor, self));
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

  getResolver() {
    if (this._resolver) {
      return this._resolver;
    }

    const nmds = this.unibuild.nodeModulesDirectories;
    const nodeModulesPaths = [];

    _.each(nmds, (nmd, path) => {
      if (! nmd.local) {
        nodeModulesPaths.push(
          files.convertToOSPath(path.replace(/\/$/g, "")));
      }
    });

    return this._resolver = Resolver.getOrCreate({
      caller: "PackageSourceBatch#getResolver",
      sourceRoot: this.sourceRoot,
      targetArch: this.processor.arch,
      extensions: this.importExtensions,
      nodeModulesPaths,
    });
  }

  _getSourceProcessorSet() {
    const self = this;

    buildmessage.assertInJob();

    var isopack = self.unibuild.pkg;
    const activePluginPackages = compiler.getActivePluginPackages(isopack, {
      uses: self.unibuild.uses,
      isopackCache: self.processor.isopackCache
    });
    const sourceProcessorSet = new buildPluginModule.SourceProcessorSet(
      isopack.displayName(), { hardcodeJs: true });

    _.each(activePluginPackages, function (otherPkg) {
      otherPkg.ensurePluginsInitialized();

      sourceProcessorSet.merge(
        otherPkg.sourceProcessors.compiler, {arch: self.processor.arch});
    });

    return sourceProcessorSet;
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
        importExtensions: batch.importExtensions,
      });
    });

    if (! map.has("modules")) {
      // In the unlikely event that no package is using the modules
      // package, then the map is already complete, and we don't need to
      // do any import scanning.
      return map;
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

      const scanner = new ImportScanner({
        name,
        bundleArch: batch.processor.arch,
        extensions: batch.importExtensions,
        sourceRoot: batch.sourceRoot,
        nodeModulesPaths,
        watchSet: batch.unibuild.watchSet,
      });

      scanner.addInputFiles(map.get(name).files);

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

      if (isApp) {
        const appFilesWithoutNodeModules = [];

        outputFiles.forEach(file => {
          const parts = file.absModuleId.split("/");
          assert.strictEqual(parts[0], "");
          const nodeModulesIndex = parts.indexOf("node_modules");

          if (nodeModulesIndex === -1 || (nodeModulesIndex === 1 &&
                                          parts[2] === "meteor")) {
            appFilesWithoutNodeModules.push(file);
          } else {
            // This file is going to be installed in a node_modules
            // directory, so we move it to the modules bundle so that it
            // can be imported by any package that uses the modules
            // package. Note that this includes all files within any
            // node_modules directory in the app, even though packages in
            // client/node_modules will not be importable by Meteor
            // packages, because it's important for all npm packages in
            // the app to share the same limited scope (i.e. the scope of
            // the modules package).
            map.get("modules").files.push(file);
          }
        });

        map.get(null).files = appFilesWithoutNodeModules;

      } else {
        map.get(name).files = outputFiles;
      }
    });

    return map;
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
  getResources({
    files: jsResources,
    importExtensions = [".js", ".json"],
  }) {
    buildmessage.assertInJob();

    function flatten(arrays) {
      return Array.prototype.concat.apply([], arrays);
    }

    const resources = flatten(_.pluck(this.resourceSlots, 'outputResources'));

    resources.push(...this._linkJS(jsResources || flatten(
      _.pluck(this.resourceSlots, 'jsOutputResources')
    ), this.useMeteorInstall && {
      extensions: importExtensions
    }));

    return resources;
  }

  _linkJS(jsResources, meteorInstallOptions) {
    const self = this;
    buildmessage.assertInJob();

    var bundleArch = self.processor.arch;

    // Run the linker.
    const isApp = ! self.unibuild.pkg.name;
    const isWeb = archinfo.matches(self.unibuild.arch, "web");
    const linkerOptions = {
      isApp,
      meteorInstallOptions,
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
  "computeJsOutputFilesMap"
], method => {
  PackageSourceBatch[method] = Profile(
    "PackageSourceBatch." + method,
    PackageSourceBatch[method]);
});
