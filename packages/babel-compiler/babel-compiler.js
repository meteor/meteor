/**
 * A compiler that can be instantiated with features and used inside
 * Plugin.registerCompiler
 * @param {Object} extraFeatures The same object that getDefaultOptions takes
 */
BabelCompiler = function BabelCompiler(extraFeatures) {
  this.extraFeatures = extraFeatures;
  this._babelrcCache = null;
  this._babelrcWarnings = Object.create(null);
};

var BCp = BabelCompiler.prototype;
var excludedFileExtensionPattern = /\.es5\.js$/i;
var hasOwn = Object.prototype.hasOwnProperty;

BCp.processFilesForTarget = function (inputFiles) {
  // Reset this cache for each batch processed.
  this._babelrcCache = null;

  inputFiles.forEach(function (inputFile) {
    var toBeAdded = this.processOneFileForTarget(inputFile);
    if (toBeAdded) {
      inputFile.addJavaScript(toBeAdded);
    }
  }, this);
};

// Returns an object suitable for passing to inputFile.addJavaScript, or
// null to indicate there was an error, and nothing should be added.
BCp.processOneFileForTarget = function (inputFile, source) {
  this._babelrcCache = this._babelrcCache || Object.create(null);

  if (typeof source !== "string") {
    // Other compiler plugins can call processOneFileForTarget with a
    // source string that's different from inputFile.getContentsAsString()
    // if they've already done some processing.
    source = inputFile.getContentsAsString();
  }

  var packageName = inputFile.getPackageName();
  var inputFilePath = inputFile.getPathInPackage();
  var outputFilePath = inputFilePath;
  var fileOptions = inputFile.getFileOptions();
  var toBeAdded = {
    sourcePath: inputFilePath,
    path: outputFilePath,
    data: source,
    hash: inputFile.getSourceHash(),
    sourceMap: null,
    bare: !! fileOptions.bare
  };
  var cacheDeps = {
    sourceHash: toBeAdded.hash
  };

  // If you need to exclude a specific file within a package from Babel
  // compilation, pass the { transpile: false } options to api.addFiles
  // when you add that file.
  if (fileOptions.transpile !== false &&
      // Bare files should not be transpiled by Babel, because they do not
      // have access to CommonJS APIs like `require`, `module`, `exports`.
      ! toBeAdded.bare &&
      // If you need to exclude a specific file within an app from Babel
      // compilation, give it the following file extension: .es5.js
      ! excludedFileExtensionPattern.test(inputFilePath)) {

    var targetCouldBeInternetExplorer8 =
      inputFile.getArch() === "web.browser";

    var extraFeatures = Object.assign({}, this.extraFeatures);

    if (! extraFeatures.hasOwnProperty("jscript")) {
      // Perform some additional transformations to improve compatibility
      // in older browsers (e.g. wrapping named function expressions, per
      // http://kiro.me/blog/nfe_dilemma.html).
      extraFeatures.jscript = targetCouldBeInternetExplorer8;
    }

    if (inputFile.isPackageFile()) {
      // When compiling package files, handle import/export syntax using
      // the official Babel plugin, so that package authors won't publish
      // code that relies on module.import and module.export, because such
      // code would fail on Meteor versions before 1.3.3.  When compiling
      // application files, however, it's fine to rely on module.import
      // and module.export, and the developer experience will be much
      // better for it: faster compilation, real variables, import
      // statements inside conditional statements, etc.
      //
      // TODO Remove this once we are confident enough developers have
      // updated to a version of Meteor that supports module.import and
      // module.export.
      extraFeatures.legacyModules = true;
    }

    var babelOptions = Babel.getDefaultOptions(extraFeatures);

    this.inferExtraBabelOptions(inputFile, babelOptions, cacheDeps);

    babelOptions.sourceMap = true;
    babelOptions.filename =
      babelOptions.sourceFileName = packageName
      ? "/packages/" + packageName + "/" + inputFilePath
      : "/" + inputFilePath;

    babelOptions.sourceMapTarget = babelOptions.filename + ".map";

    try {
      var result = profile('Babel.compile', function () {
        return Babel.compile(source, babelOptions, cacheDeps);
      });
    } catch (e) {
      if (e.loc) {
        inputFile.error({
          message: e.message,
          line: e.loc.line,
          column: e.loc.column,
        });

        return null;
      }

      throw e;
    }

    toBeAdded.data = result.code;
    toBeAdded.hash = result.hash;
    toBeAdded.sourceMap = result.map;
  }

  return toBeAdded;
};

BCp.setDiskCacheDirectory = function (cacheDir) {
  Babel.setCacheDir(cacheDir);
};

function profile(name, func) {
  if (typeof Profile !== 'undefined') {
    return Profile.time(name, func);
  } else {
    return func();
  }
};

BCp.inferExtraBabelOptions = function (inputFile, babelOptions, cacheDeps) {
  if (! inputFile.require ||
      ! inputFile.findControlFile ||
      ! inputFile.readAndWatchFile) {
    return false;
  }

  return (
    // If a .babelrc exists, it takes precedence over package.json.
    this._inferFromBabelRc(inputFile, babelOptions, cacheDeps) ||
    this._inferFromPackageJson(inputFile, babelOptions, cacheDeps)
  );
};

BCp._inferFromBabelRc = function (inputFile, babelOptions, cacheDeps) {
  var babelrcPath = inputFile.findControlFile(".babelrc");
  if (babelrcPath) {
    if (! hasOwn.call(this._babelrcCache, babelrcPath)) {
      this._babelrcCache[babelrcPath] =
        JSON.parse(inputFile.readAndWatchFile(babelrcPath));
    }

    return this._inferHelper(
      inputFile,
      babelOptions,
      babelrcPath,
      this._babelrcCache[babelrcPath],
      cacheDeps
    );
  }
};

BCp._inferFromPackageJson = function (inputFile, babelOptions, cacheDeps) {
  var pkgJsonPath = inputFile.findControlFile("package.json");
  if (pkgJsonPath) {
    if (! hasOwn.call(this._babelrcCache, pkgJsonPath)) {
      this._babelrcCache[pkgJsonPath] = JSON.parse(
        inputFile.readAndWatchFile(pkgJsonPath)
      ).babel || null;
    }

    return this._inferHelper(
      inputFile,
      babelOptions,
      pkgJsonPath,
      this._babelrcCache[pkgJsonPath],
      cacheDeps
    );
  }
};

BCp._inferHelper = function (
  inputFile,
  babelOptions,
  controlFilePath,
  babelrc,
  cacheDeps
) {
  if (! babelrc) {
    return false;
  }

  var compiler = this;
  var inferredPresets = [];
  var result;

  function infer(listName, prefix) {
    var list = babelrc[listName];
    if (! Array.isArray(list) || list.length === 0) {
      return;
    }

    function req(id) {
      try {
        return reqMightThrow(id);
      } catch (e) {
        if (e.code !== "MODULE_NOT_FOUND") {
          throw e;
        }

        if (! hasOwn.call(compiler._babelrcWarnings, id)) {
          compiler._babelrcWarnings[id] = controlFilePath;

          console.error(
            "Warning: unable to resolve " +
              JSON.stringify(id) +
              " in " + listName +
              " of " + controlFilePath
          );
        }

        return null;
      }
    }

    function reqMightThrow(id) {
      var isTopLevel = "./".indexOf(id.charAt(0)) < 0;
      var presetOrPlugin;
      var presetOrPluginMeta;

      if (isTopLevel) {
        try {
          // If the identifier is top-level, try to prefix it with
          // "babel-plugin-" or "babel-preset-".
          presetOrPlugin = inputFile.require(prefix + id);
          presetOrPluginMeta = inputFile.require(
            packageNameFromTopLevelModuleId(prefix + id) + '/package.json');
        } catch (e) {
          if (e.code !== "MODULE_NOT_FOUND") {
            throw e;
          }
          // Fall back to requiring the plugin as-is if the prefix failed.
          presetOrPlugin = inputFile.require(id);
          presetOrPluginMeta = inputFile.require(
            packageNameFromTopLevelModuleId(id) + '/package.json');
        }

      } else {
        // If the identifier is not top-level, but relative or absolute,
        // then it will be required as-is, so that you can implement your
        // own Babel plugins locally, rather than always using plugins
        // installed from npm.
        presetOrPlugin = inputFile.require(id, controlFilePath);

        // Note that inputFile.readAndWatchFileWithHash converts module
        // identifers to OS-specific paths if necessary.
        var absId = inputFile.resolve(id, controlFilePath);
        var info = inputFile.readAndWatchFileWithHash(absId);

        presetOrPluginMeta = {
          name: absId,
          version: info.hash
        };
      }

      return {
        name: presetOrPluginMeta.name,
        version: presetOrPluginMeta.version,
        module: presetOrPlugin.__esModule
          ? presetOrPlugin.default
          : presetOrPlugin
      };
    }

    var filtered = [];

    list.forEach(function (item, i) {
      if (typeof item === "string") {
        result = req(item);
        if (! result) return;
        item = result.module;
        cacheDeps[result.name] = result.version;
      } else if (Array.isArray(item) &&
                 typeof item[0] === "string") {
        item = item.slice(); // defensive copy
        result = req(item[0]);
        if (! result) return;
        item[0] = result.module;
        cacheDeps[result.name] = result.version;
      }
      // else, an object { presets: [], plugins: [] } from meteorBabel, whose
      // version is used for the cache hash internally.

      filtered.push(item);
    });

    if (listName === "plugins") {
      // Turn any additional plugins into their own preset, so that they
      // can come before babel-preset-meteor.
      inferredPresets.push({ plugins: filtered });
    } else if (listName === "presets") {
      inferredPresets.push.apply(inferredPresets, filtered);
    }
  }

  infer("presets", "babel-preset-");
  infer("plugins", "babel-plugin-");

  if (inferredPresets.length > 0) {
    babelOptions.presets.push.apply(
      babelOptions.presets,
      inferredPresets
    );

    return true;
  }

  return false;
};

// 'react-hot-loader/babel' => 'react-hot-loader'
function packageNameFromTopLevelModuleId(id) {
  return id.split("/", 1)[0];
}
