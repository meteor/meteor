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
import {sha1} from  '../fs/watch.js';
import LRU from 'lru-cache';
import Fiber from 'fibers';
import {sourceMapLength} from '../utils/utils.js';

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


exports.CompilerPluginProcessor = function (options) {
  var self = this;
  self.unibuilds = options.unibuilds;
  self.arch = options.arch;
  self.isopackCache = options.isopackCache;

  self.linkerCacheDir = options.linkerCacheDir;
  if (self.linkerCacheDir) {
    files.mkdir_p(self.linkerCacheDir);
  }
};
_.extend(exports.CompilerPluginProcessor.prototype, {
  runCompilerPlugins: function () {
    var self = this;
    buildmessage.assertInJob();

    // plugin id -> {sourceProcessor, resourceSlots}
    var sourceProcessorsWithSlots = {};

    var sourceBatches = _.map(self.unibuilds, function (unibuild) {
      return new PackageSourceBatch(unibuild, self, {
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
        if (! sourceProcessor)
          return;

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

      Profile.time(jobTitle, () => {
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
            markedMethod(inputFiles);
          } catch (e) {
            buildmessage.exception(e);
          }
        });
      });
    });

    return sourceBatches;
  }
});

var InputFile = function (resourceSlot) {
  var self = this;
  // We use underscored attributes here because this is user-visible code and we
  // don't want users to be accessing anything that we don't document.
  self._resourceSlot = resourceSlot;
};
util.inherits(InputFile, buildPluginModule.InputFile);
_.extend(InputFile.prototype, {
  getContentsAsBuffer: function () {
    var self = this;
    return self._resourceSlot.inputResource.data;
  },
  getPackageName: function () {
    var self = this;
    return self._resourceSlot.packageSourceBatch.unibuild.pkg.name;
  },
  getPathInPackage: function () {
    var self = this;
    return self._resourceSlot.inputResource.path;
  },
  getFileOptions: function () {
    var self = this;
    // XXX fileOptions only exists on some resources (of type "source"). The JS
    // resources might not have this property.
    return self._resourceSlot.inputResource.fileOptions || {};
  },
  getArch: function () {
    return this._resourceSlot.packageSourceBatch.processor.arch;
  },
  getSourceHash: function () {
    return this._resourceSlot.inputResource.hash;
  },

  /**
   * @summary Returns the extension that matched the compiler plugin.
   * The longest prefix is preferred.
   * @returns {String}
   */
  getExtension: function () {
    return this._resourceSlot.inputResource.extension;
  },

  /**
   * @summary Returns a list of symbols declared as exports in this target. The
   * result of `api.export('symbol')` calls in target's control file such as
   * package.js.
   * @memberof InputFile
   * @returns {String[]}
   */
  getDeclaredExports: function () {
    var self = this;
    return self._resourceSlot.packageSourceBatch.unibuild.declaredExports;
  },

  /**
   * @summary Returns a relative path that can be used to form error messages or
   * other display properties. Can be used as an input to a source map.
   * @memberof InputFile
   * @returns {String}
   */
  getDisplayPath: function () {
    var self = this;
    return self._resourceSlot.packageSourceBatch.unibuild.pkg._getServePath(self.getPathInPackage());
  },

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
  addStylesheet: function (options) {
    var self = this;
    if (options.sourceMap && typeof options.sourceMap === 'string') {
      // XXX remove an anti-XSSI header? ")]}'\n"
      options.sourceMap = JSON.parse(options.sourceMap);
    }
    self._resourceSlot.addStylesheet(options);
  },
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
  addJavaScript: function (options) {
    var self = this;
    if (options.sourceMap && typeof options.sourceMap === 'string') {
      // XXX remove an anti-XSSI header? ")]}'\n"
      options.sourceMap = JSON.parse(options.sourceMap);
    }
    self._resourceSlot.addJavaScript(options);
  },
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
  addAsset: function (options) {
    var self = this;
    self._resourceSlot.addAsset(options);
  },

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
  addHtml: function (options) {
    var self = this;
    self._resourceSlot.addHtml(options);
  }
});

var ResourceSlot = function (unibuildResourceInfo,
                             sourceProcessor,
                             packageSourceBatch) {
  var self = this;
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
      self.jsOutputResources.push(self.inputResource);
    } else {
      self.outputResources.push(self.inputResource);
    }
  }
};
_.extend(ResourceSlot.prototype, {
  addStylesheet: function (options) {
    var self = this;
    if (! self.sourceProcessor)
      throw Error("addStylesheet on non-source ResourceSlot?");

    self.outputResources.push({
      type: "css",
      refreshable: true,
      data: new Buffer(files.convertToStandardLineEndings(options.data), 'utf8'),
      servePath: self.packageSourceBatch.unibuild.pkg._getServePath(
        options.path),
      // XXX do we need to call convertSourceMapPaths here like we did
      //     in legacy handlers?
      sourceMap: options.sourceMap
    });
  },
  addJavaScript: function (options) {
    var self = this;
    // #HardcodeJs this gets called by constructor in the "js" case
    if (! self.sourceProcessor && self.inputResource.extension !== "js")
      throw Error("addJavaScript on non-source ResourceSlot?");

    // By default, use the 'bare' option given to addFiles, but allow the option
    // passed to addJavaScript to override it.
    var bare = self.inputResource.fileOptions &&
      self.inputResource.fileOptions.bare;
    if (options.hasOwnProperty('bare')) {
      bare = options.bare;
    }

    var data = new Buffer(
      files.convertToStandardLineEndings(options.data), 'utf8');
    self.jsOutputResources.push({
      type: "js",
      data: data,
      servePath: self.packageSourceBatch.unibuild.pkg._getServePath(
        options.path),
      // XXX should we allow users to be trusted and specify a hash?
      hash: sha1(data),
      // XXX do we need to call convertSourceMapPaths here like we did
      //     in legacy handlers?
      sourceMap: options.sourceMap,
      bare: !! bare
    });
  },
  addAsset: function (options) {
    var self = this;
    if (! self.sourceProcessor)
      throw Error("addAsset on non-source ResourceSlot?");

    if (! (options.data instanceof Buffer)) {
      if (_.isString(options.data)) {
        options.data = new Buffer(options.data);
      } else {
        throw new Error("'data' option to addAsset must be a Buffer or String.");
      }
    }

    self.outputResources.push({
      type: 'asset',
      data: options.data,
      path: options.path,
      servePath: self.packageSourceBatch.unibuild.pkg._getServePath(
        options.path),
      hash: sha1(options.data)
    });
  },
  addHtml: function (options) {
    var self = this;
    var unibuild = self.packageSourceBatch.unibuild;

    if (! archinfo.matches(unibuild.arch, "web"))
      throw new Error("Document sections can only be emitted to " +
                      "web targets");
    if (options.section !== "head" && options.section !== "body")
      throw new Error("'section' must be 'head' or 'body'");
    if (typeof options.data !== "string")
      throw new Error("'data' option to appendDocument must be a string");

    self.outputResources.push({
      type: options.section,
      data: new Buffer(files.convertToStandardLineEndings(options.data), 'utf8')
    });
  }
});

var PackageSourceBatch = function (unibuild, processor, {linkerCacheDir}) {
  var self = this;
  buildmessage.assertInJob();

  self.unibuild = unibuild;
  self.processor = processor;
  self.linkerCacheDir = linkerCacheDir;
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
      }
    }
    self.resourceSlots.push(new ResourceSlot(resource, sourceProcessor, self));
  });
};
_.extend(PackageSourceBatch.prototype, {
  _getSourceProcessorSet: function () {
    var self = this;

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
  },

  // Called by bundler's Target._emitResources.  It returns the actual resources
  // that end up in the program for this package.  By this point, it knows what
  // its dependencies are and what their exports are, so it can set up
  // linker-style imports and exports.
  getResources: Profile("PackageSourceBatch#getResources", function () {
    var self = this;
    buildmessage.assertInJob();

    var flatten = function (arrays) {
      return Array.prototype.concat.apply([], arrays);
    };
    var resources = flatten(_.pluck(self.resourceSlots, 'outputResources'));
    var jsResources = flatten(_.pluck(self.resourceSlots, 'jsOutputResources'));
    Array.prototype.push.apply(resources, self._linkJS(jsResources));
    return resources;
  }),

  _linkJS: Profile("PackageSourceBatch#_linkJS", function (jsResources) {
    var self = this;
    buildmessage.assertInJob();

    var isopackCache = self.processor.isopackCache;
    var bundleArch = self.processor.arch;

    // Compute imports by merging the exports of all of the packages we
    // use. Note that in the case of conflicting symbols, later packages get
    // precedence.
    //
    // We don't get imports from unordered dependencies (since they may not be
    // defined yet) or from weak/debugOnly dependencies (because the meaning of
    // a name shouldn't be affected by the non-local decision of whether or not
    // an unrelated package in the target depends on something).
    var imports = {}; // map from symbol to supplying package name

    var addImportsForUnibuild = function (depUnibuild) {
      _.each(depUnibuild.declaredExports, function (symbol) {
        // Slightly hacky implementation of test-only exports.
        if (! symbol.testOnly || self.unibuild.pkg.isTest) {
          imports[symbol.name] = depUnibuild.pkg.name;
        }
      });
    };
    compiler.eachUsedUnibuild({
      dependencies: self.unibuild.uses,
      arch: bundleArch,
      isopackCache: isopackCache,
      skipUnordered: true,
      // don't import symbols from debugOnly and prodOnly packages, because
      // if the package is not linked it will cause a runtime error.
      // the code must access them with `Package["my-package"].MySymbol`.
      skipDebugOnly: true,
      skipProdOnly: true,
      // We only care about getting exports here, so it's OK if we get the Mac
      // version when we're bundling for Linux.
      allowWrongPlatform: true,
    }, addImportsForUnibuild);

    // Run the linker.
    const isApp = ! self.unibuild.pkg.name;
    const linkerOptions = {
      useGlobalNamespace: isApp,
      // I was confused about this, so I am leaving a comment -- the
      // combinedServePath is either [pkgname].js or [pluginName]:plugin.js.
      // XXX: If we change this, we can get rid of source arch names!
      combinedServePath: isApp ? null :
        "/packages/" + colonConverter.convert(
          self.unibuild.pkg.name +
            (self.unibuild.kind === "main" ? "" : (":" + self.unibuild.kind)) +
            ".js"),
      name: self.unibuild.pkg.name || null,
      declaredExports: _.pluck(self.unibuild.declaredExports, 'name'),
      imports: imports,
      // XXX report an error if there is a package called global-imports
      importStubServePath: isApp && '/packages/global-imports.js',
      includeSourceMapInstructions: archinfo.matches(self.unibuild.arch, "web")
    };

    const cacheKey = sha1(JSON.stringify({
      linkerOptions,
      files: jsResources.map((inputFile) => {
        // Note that we don't use inputFile.sourceMap in this cache key. Maybe
        // this isn't technically accurate? Is it likely that the source map
        // will change but the file won't?
        return {
          servePath: inputFile.servePath,
          hash: inputFile.hash,
          bare: inputFile.bare
        };
      })
    }));

    {
      const inMemoryCached = LINKER_CACHE.get(cacheKey);
      if (inMemoryCached) {
        if (CACHE_DEBUG) {
          console.log('LINKER IN-MEMORY CACHE HIT:',
                      linkerOptions.name, bundleArch);
        }
        return inMemoryCached;
      }
    }

    const cacheFilename = self.linkerCacheDir && files.pathJoin(
      self.linkerCacheDir, cacheKey + '.cache');

    // The return value from _linkJS includes Buffers, but we want everything to
    // be JSON for writing to the disk cache. This function converts the string
    // version to the Buffer version.
    function bufferifyJSONReturnValue(resources) {
      resources.forEach((r) => {
        r.data = new Buffer(r.data, 'utf8');
      });
    }

    if (cacheFilename) {
      let diskCached = null;
      try {
        diskCached = files.readJSONOrNull(cacheFilename);
      } catch (e) {
        // Ignore JSON parse errors; pretend there was no cache.
        if (!(e instanceof SyntaxError))
          throw e;
      }
      if (diskCached && diskCached instanceof Array) {
        // Fix the non-JSON part of our return value.
        bufferifyJSONReturnValue(diskCached);
        if (CACHE_DEBUG) {
          console.log('LINKER DISK CACHE HIT:', linkerOptions.name, bundleArch);
        }
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
        Fiber(() => files.writeFileAtomically(cacheFilename, retAsJSON)).run();
      }
    }

    return ret;
  })
});
