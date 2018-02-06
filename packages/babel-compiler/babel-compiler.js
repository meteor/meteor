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

    if (inputFile.getArch().startsWith("os.")) {
      // Start with a much simpler set of Babel presets and plugins if
      // we're compiling for Node 8.
      extraFeatures.nodeMajorVersion = parseInt(process.versions.node);
    }

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
      const copy = Object.create(null);

      path = path || [];
      const index = path.length;

      if (obj.presets) {
        path[index] = "presets";
        copy.presets = walkHelper(obj.presets, path);
      }

      if (obj.plugins) {
        path[index] = "plugins";
        copy.plugins = walkHelper(obj.plugins, path);
      }

      path.pop();

      return copy;
    }

    return obj;
  }

  function walkHelper(list, path) {
    const copy = [];

    list.forEach(function (pluginOrPreset) {
      const res = resolveHelper(pluginOrPreset, path);
      if (res) {
        copy.push(res);
      }
    });

    return copy;
  }

  function resolveHelper(value, path) {
    if (value) {
      if (typeof value === "function") {
        // The value has already been resolved to a plugin function.
        return value;
      }

      if (Array.isArray(value)) {
        // The value is a [plugin, options] pair.
        const res = resolveHelper(value[0], path);
        if (res) {
          const copy = value.slice(0);
          copy[0] = res;
          return copy;
        }

      } else if (typeof value === "string") {
        // The value is a string that we need to require.
        const result = requireWithPath(value, path);
        if (result && result.module) {
          cacheDeps[result.name] = result.version;
          return walkBabelRC(result.module, path);
        }

      } else if (typeof value === "object") {
        // The value is a { presets?, plugins? } preset object.
        return walkBabelRC(value, path);
      }
    }

    return null;
  }

  function requireWithPath(id, path) {
    const prefixes = [];
    const lastInPath = path[path.length - 1];
    if (lastInPath === "presets") {
      prefixes.push("@babel/preset-", "babel-preset-");
    } else if (lastInPath === "plugins") {
      prefixes.push("@babel/plugin-", "babel-plugin-");
    }

    // Try without a prefix if the prefixes fail.
    prefixes.push("");

    try {
      return requireWithPrefixes(inputFile, id, prefixes, controlFilePath);
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
            " of " + controlFilePath + ", due to:"
        );

        console.error(e.stack || e);
      }

      return null;
    }
  }

  const clean = walkBabelRC(babelrc);
  merge(babelOptions, clean, "presets");
  merge(babelOptions, clean, "plugins");

  if (babelrc && babelrc.env) {
    const envKey =
      process.env.BABEL_ENV ||
      process.env.NODE_ENV ||
      "development";

    const clean = walkBabelRC(babelrc.env[envKey]);

    if (clean) {
      merge(babelOptions, clean, "presets");
      merge(babelOptions, clean, "plugins");
    }
  }

  return !! (babelOptions.presets ||
             babelOptions.plugins);
};

function merge(babelOptions, babelrc, name) {
  if (babelrc[name]) {
    var list = babelOptions[name] || [];
    babelOptions[name] = list;
    list.push.apply(list, babelrc[name]);
  }
}

function requireWithPrefixes(inputFile, id, prefixes, controlFilePath) {
  var isTopLevel = "./".indexOf(id.charAt(0)) < 0;
  var presetOrPlugin;
  var presetOrPluginMeta;

  if (isTopLevel) {
    var presetOrPluginId;

    var found = prefixes.some(function (prefix) {
      try {
        // Call inputFile.resolve here rather than inputFile.require so
        // that the import doesn't fail due to missing transitive
        // dependencies imported by the preset or plugin.
        if (inputFile.resolve(prefix + id)) {
          presetOrPluginId = prefix + id;
        }

        presetOrPluginMeta = inputFile.require(
          packageNameFromTopLevelModuleId(prefix + id) + "/package.json");

        return true;

      } catch (e) {
        if (e.code !== "MODULE_NOT_FOUND") {
          throw e;
        }

        return false;
      }
    });

    if (found) {
      if (presetOrPluginMeta.name === "babel-preset-meteor") {
        // Since Meteor always includes babel-preset-meteor automatically,
        // it's likely a mistake for that preset to appear in a custom
        // .babelrc file. Previously we recommended that developers simply
        // remove the preset (e.g. #9631), but we can easily just ignore
        // it by returning null here, which seems like a better solution
        // since it allows the same .babelrc file to be used for other
        // purposes, such as running tests with a testing tool that needs
        // to compile application code the same way Meteor does.
        return null;
      }
      presetOrPlugin = inputFile.require(presetOrPluginId);
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

  if (presetOrPlugin &&
      presetOrPluginMeta) {
    return {
      name: presetOrPluginMeta.name,
      version: presetOrPluginMeta.version,
      module: presetOrPlugin.__esModule
        ? presetOrPlugin.default
        : presetOrPlugin
    };
  }

  return null;
}

// react-hot-loader/babel => react-hot-loader
// @babel/preset-env/lib/index.js => @babel/preset-env
function packageNameFromTopLevelModuleId(id) {
  const parts = id.split("/", 2);
  if (parts[0].charAt(0) === "@") {
    return parts.join("/");
  }
  return parts[0];
}
