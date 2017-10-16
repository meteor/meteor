var semver = Npm.require("semver");

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
var excludedFileExtensionPattern = /\.(es5|min)\.js$/i;
var hasOwn = Object.prototype.hasOwnProperty;

// There's no way to tell the current Meteor version, but we can infer
// whether it's Meteor 1.4.4 or earlier by checking the Node version.
var isMeteorPre144 = semver.lt(process.version, "4.8.1");

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

    var extraFeatures = Object.assign({}, this.extraFeatures);

    if (! extraFeatures.hasOwnProperty("jscript")) {
      // Perform some additional transformations to improve compatibility
      // in older browsers (e.g. wrapping named function expressions, per
      // http://kiro.me/blog/nfe_dilemma.html).
      extraFeatures.jscript = true;
    }

    var babelOptions = Babel.getDefaultOptions(extraFeatures);

    this.inferExtraBabelOptions(inputFile, babelOptions, cacheDeps);

    babelOptions.sourceMap = true;
    babelOptions.filename =
      babelOptions.sourceFileName = packageName
      ? "packages/" + packageName + "/" + inputFilePath
      : inputFilePath;

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

    if (isMeteorPre144) {
      // Versions of meteor-tool earlier than 1.4.4 do not understand that
      // module.importSync is synonymous with the deprecated module.import
      // and thus fail to register dependencies for importSync calls.
      // This string replacement may seem a bit hacky, but it will tide us
      // over until everyone has updated to Meteor 1.4.4.
      // https://github.com/meteor/meteor/issues/8572
      result.code = result.code.replace(
        /\bmodule\.importSync\b/g,
        "module.import"
      );
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
      try {
        this._babelrcCache[babelrcPath] =
          JSON.parse(inputFile.readAndWatchFile(babelrcPath));
      } catch (e) {
        if (e instanceof SyntaxError) {
          e.message = ".babelrc is not a valid JSON file: " + e.message;
        }

        throw e;
      }
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

  function walkBabelRC(obj, path) {
    if (obj && typeof obj === "object") {
      path = path || [];
      var index = path.push("presets") - 1;
      walkHelper(obj.presets, path);
      path[index] = "plugins";
      walkHelper(obj.plugins, path);
      path.pop();
    }
  }

  function walkHelper(list, path) {
    if (list) {
      // Empty the list and then refill it with resolved values.
      list.splice(0).forEach(function (pluginOrPreset) {
        var res = resolveHelper(pluginOrPreset, path);
        if (res) {
          list.push(res);
        }
      });
    }
  }

  function resolveHelper(value, path) {
    if (value) {
      if (typeof value === "function") {
        // The value has already been resolved to a plugin function.
        return value;
      }

      if (Array.isArray(value)) {
        // The value is a [plugin, options] pair.
        var res = value[0] = resolveHelper(value[0], path);
        if (res) {
          return value;
        }

      } else if (typeof value === "string") {
        // The value is a string that we need to require.
        var result = requireWithPath(value, path);
        if (result && result.module) {
          cacheDeps[result.name] = result.version;
          walkBabelRC(result.module, path);
          return result.module;
        }

      } else if (typeof value === "object") {
        // The value is a { presets?, plugins? } preset object.
        walkBabelRC(value, path);
        return value;
      }
    }

    return null;
  }

  function requireWithPath(id, path) {
    var prefix;
    var lastInPath = path[path.length - 1];
    if (lastInPath === "presets") {
      prefix = "babel-preset-";
    } else if (lastInPath === "plugins") {
      prefix = "babel-plugin-";
    }

    try {
      return requireWithPrefix(inputFile, id, prefix, controlFilePath);
    } catch (e) {
      if (e.code !== "MODULE_NOT_FOUND") {
        throw e;
      }

      if (! hasOwn.call(compiler._babelrcWarnings, id)) {
        compiler._babelrcWarnings[id] = controlFilePath;

        console.error(
          "Warning: unable to resolve " +
            JSON.stringify(id) +
            " in " + path.join(".") +
            " of " + controlFilePath
        );
      }

      return null;
    }
  }

  babelrc = JSON.parse(JSON.stringify(babelrc));

  walkBabelRC(babelrc);

  merge(babelOptions, babelrc, "presets");
  merge(babelOptions, babelrc, "plugins");

  const babelEnv = (process.env.BABEL_ENV ||
                    process.env.NODE_ENV ||
                    "development");
  if (babelrc && babelrc.env && babelrc.env[babelEnv]) {
    const env = babelrc.env[babelEnv];
    walkBabelRC(env);
    merge(babelOptions, env, "presets");
    merge(babelOptions, env, "plugins");
  }

  return !! (babelrc.presets ||
             babelrc.plugins);
};

function merge(babelOptions, babelrc, name) {
  if (babelrc[name]) {
    var list = babelOptions[name] || [];
    babelOptions[name] = list;
    list.push.apply(list, babelrc[name]);
  }
}

function requireWithPrefix(inputFile, id, prefix, controlFilePath) {
  var isTopLevel = "./".indexOf(id.charAt(0)) < 0;
  var presetOrPlugin;
  var presetOrPluginMeta;

  if (isTopLevel) {
    if (! prefix) {
      throw new Error("missing babelrc prefix");
    }

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

// 'react-hot-loader/babel' => 'react-hot-loader'
function packageNameFromTopLevelModuleId(id) {
  return id.split("/", 1)[0];
}
