var semver = Npm.require("semver");
var JSON5 = Npm.require("json5");
var SWC = Npm.require("@meteorjs/swc-core");
const reifyCompile = Npm.require("@meteorjs/reify/lib/compiler").compile;
const reifyAcornParse = Npm.require("@meteorjs/reify/lib/parsers/acorn").parse;
var fs = Npm.require('fs');
var path = Npm.require('path');
var vm = Npm.require('vm');
var crypto = Npm.require('crypto');

/**
 * A compiler that can be instantiated with features and used inside
 * Plugin.registerCompiler
 * @param {Object} extraFeatures The same object that getDefaultOptions takes
 */
BabelCompiler = function BabelCompiler(extraFeatures, modifyConfig) {
  this.extraFeatures = extraFeatures;
  this.modifyConfig = modifyConfig;
  this._babelrcCache = null;
  this._babelrcWarnings = Object.create(null);
  this.cacheDirectory = null;
};

var BCp = BabelCompiler.prototype;
var excludedFileExtensionPattern = /\.(es5|min)\.js$/i;
var hasOwn = Object.prototype.hasOwnProperty;

// Check if verbose mode is enabled either in the provided config or in extraFeatures
BCp.isVerbose = function(config) {
  if (config?.modern?.transpiler?.verbose) {
    return true;
  }
  if (config?.verbose) {
    return true;
  }
  return !!this.extraFeatures?.verbose;
};

// There's no way to tell the current Meteor version, but we can infer
// whether it's Meteor 1.4.4 or earlier by checking the Node version.
var isMeteorPre144 = semver.lt(process.version, "4.8.1");

var enableClientTLA = process.env.METEOR_ENABLE_CLIENT_TOP_LEVEL_AWAIT === 'true';

function compileWithBabel(source, babelOptions, cacheOptions) {
  return profile('Babel.compile', function () {
    return Babel.compile(source, babelOptions, cacheOptions);
  });
}

function compileWithSwc(source, swcOptions = {}, { features }) {
  return profile('SWC.compile', function () {
    // Perform SWC transformation.
    const transformed = SWC.transformSync(source, swcOptions);

    let content = transformed.code;

    // Preserve Meteor-specific features: reify modules, nested imports, and top-level await support.
    const result = reifyCompile(content, {
      parse: reifyAcornParse,
      generateLetDeclarations: false,
      ast: false,
      // Enforce reify options for proper compatibility.
      avoidModernSyntax: true,
      enforceStrictMode: false,
      dynamicImport: true,
      ...(features.topLevelAwait && { topLevelAwait: true }),
      ...(features.compileForShell && { moduleAlias: 'module' }),
      ...((features.modernBrowsers || features.nodeMajorVersion >= 8) && {
        avoidModernSyntax: false,
        generateLetDeclarations: true,
      }),
    });
    content = result.code;

    return {
      code: content,
      map: JSON.parse(transformed.map),
      sourceType: 'module',
    };
  });
}
const DEFAULT_MODERN = {
  transpiler: true,
};

const normalizeModern = (r = false) => Object.fromEntries(
    Object.entries(DEFAULT_MODERN).map(([k, def]) => [
      k,
      r === true
        ? def
        : r === false || r?.[k] === false
        ? false
        : typeof r?.[k] === 'object'
        ? { ...r[k] }
        : def,
    ]),
);

let modernForced = JSON.parse(process.env.METEOR_MODERN || "false");

let lastModifiedMeteorConfig;
let lastModifiedMeteorConfigTime;
BCp.initializeMeteorAppConfig = function () {
  if (!lastModifiedMeteorConfig && !fs.existsSync(`${getMeteorAppDir()}/package.json`)) {
    return;
  }
  const currentLastModifiedConfigTime = fs
    .statSync(`${getMeteorAppDir()}/package.json`)
    ?.mtime?.getTime();
  if (currentLastModifiedConfigTime !== lastModifiedMeteorConfigTime) {
    lastModifiedMeteorConfigTime = currentLastModifiedConfigTime;
    lastModifiedMeteorConfig = getMeteorAppPackageJson()?.meteor;
    lastModifiedMeteorConfig = lastModifiedMeteorConfig != null ? {
      ...lastModifiedMeteorConfig,
      modern: normalizeModern(modernForced || lastModifiedMeteorConfig?.modern),
    } : {};

    if (this.isVerbose(lastModifiedMeteorConfig)) {
      logConfigBlock('Meteor Config', lastModifiedMeteorConfig);
    }
  }
  return lastModifiedMeteorConfig;
};

let lastModifiedSwcConfig;
let lastModifiedSwcConfigTime;
BCp.initializeMeteorAppSwcrc = function () {
  const hasSwcRc = fs.existsSync(`${getMeteorAppDir()}/.swcrc`);
  const hasSwcJs = !hasSwcRc && fs.existsSync(`${getMeteorAppDir()}/swc.config.js`);
  if (!lastModifiedSwcConfig && !hasSwcRc && !hasSwcJs) {
    return;
  }
  const swcFile = hasSwcJs ? 'swc.config.js' : '.swcrc';
  const filePath = `${getMeteorAppDir()}/${swcFile}`;
  const fileStats = fs.statSync(filePath);
  const fileModTime = fileStats?.mtime?.getTime();

  let currentLastModifiedConfigTime;
  if (hasSwcJs) {
    // For dynamic JS files, first get the resolved configuration
    const resolvedConfig = lastModifiedSwcConfig || getMeteorAppSwcrc(swcFile);
    // Calculate a hash of the resolved configuration to detect changes
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(resolvedConfig))
      .digest('hex');
    // Combine file modification time and content hash to create a unique identifier
    currentLastModifiedConfigTime = `${fileModTime}-${contentHash}`;
    // Store the resolved configuration
    lastModifiedSwcConfig = resolvedConfig;
  } else {
    // For static JSON files, just use the file modification time
    currentLastModifiedConfigTime = fileModTime;
  }

  if (currentLastModifiedConfigTime !== lastModifiedSwcConfigTime) {
    lastModifiedSwcConfigTime = currentLastModifiedConfigTime;
    lastModifiedSwcConfig = getMeteorAppSwcrc(swcFile);

    if (this.isVerbose(lastModifiedMeteorConfig)) {
      logConfigBlock('SWC Config', lastModifiedSwcConfig);
    }
  }
  return lastModifiedSwcConfig;
};

let lastModifiedSwcLegacyConfig;
BCp.initializeMeteorAppLegacyConfig = function () {
  const swcLegacyConfig = convertBabelTargetsForSwc(Babel.getMinimumModernBrowserVersions());
  if (this.isVerbose(lastModifiedMeteorConfig) && !lastModifiedSwcLegacyConfig) {
    logConfigBlock('SWC Legacy Config', swcLegacyConfig);
  }
  lastModifiedSwcLegacyConfig = swcLegacyConfig;
  return lastModifiedSwcConfig;
};

BCp.processFilesForTarget = function (inputFiles) {
  var compiler = this;

  // Reset this cache for each batch processed.
  this._babelrcCache = null;

  this.initializeMeteorAppConfig();
  this.initializeMeteorAppSwcrc();
  this.initializeMeteorAppLegacyConfig();

  inputFiles.forEach(function (inputFile) {
    if (inputFile.supportsLazyCompilation) {
      inputFile.addJavaScript({
        path: inputFile.getPathInPackage(),
        bare: !! inputFile.getFileOptions().bare
      }, function () {
        return compiler.processOneFileForTarget(inputFile);
      });
    } else {
      var toBeAdded = compiler.processOneFileForTarget(inputFile);
      if (toBeAdded) {
        inputFile.addJavaScript(toBeAdded);
      }
    }
  });
};

// Returns an object suitable for passing to inputFile.addJavaScript, or
// null to indicate there was an error, and nothing should be added.
BCp.processOneFileForTarget = function (inputFile, source) {
  this._babelrcCache = this._babelrcCache || Object.create(null);
  this._swcCache = this._swcCache || Object.create(null);
  this._swcIncompatible = this._swcIncompatible || Object.create(null);

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

    const features = Object.assign({}, this.extraFeatures);
    const arch = inputFile.getArch();

    if (arch.startsWith("os.")) {
      // Start with a much simpler set of Babel presets and plugins if
      // we're compiling for Node 8.
      features.nodeMajorVersion = parseInt(process.versions.node, 10);
    } else if (arch === "web.browser") {
      features.modernBrowsers = true;
    }

    features.topLevelAwait = inputFile.supportsTopLevelAwait &&
       (arch.startsWith('os.') || enableClientTLA);

    features.useNativeAsyncAwait = Meteor.isFibersDisabled;

    if (! features.hasOwnProperty("jscript")) {
      // Perform some additional transformations to improve compatibility
      // in older browsers (e.g. wrapping named function expressions, per
      // http://kiro.me/blog/nfe_dilemma.html).
      features.jscript = true;
    }

    if (shouldCompileModulesOnly(inputFilePath)) {
      // Modules like @babel/runtime/helpers/esm/typeof.js need to be
      // compiled to support ECMAScript modules syntax, but should *not*
      // be compiled in any other way (for more explanation, see my longer
      // comment in shouldCompileModulesOnly).
      features.compileModulesOnly = true;
    }

    const cacheOptions = {
      cacheDirectory: this.cacheDirectory,
      cacheDeps: {
        sourceHash: toBeAdded.hash,
      },
    };

    const filename = packageName
      ? `packages/${packageName}/${inputFilePath}`
      : inputFilePath;

    const setupBabelOptions = () => {
      this.inferTypeScriptConfig(features, inputFile, cacheOptions.cacheDeps);

      var babelOptions = Babel.getDefaultOptions(features);
      babelOptions.caller = { name: "meteor", arch };

      babelOptions.sourceMaps = true;
      babelOptions.filename = babelOptions.sourceFileName = filename;

      this.inferExtraBabelOptions(inputFile, babelOptions, cacheOptions.cacheDeps);

      if (this.modifyConfig) {
        this.modifyConfig(babelOptions, inputFile);
      }

      return babelOptions;
    };

    const setupSWCOptions = () => {
      const isTypescriptSyntax = inputFilePath.endsWith('.ts') || inputFilePath.endsWith('.tsx');
      const hasTSXSupport = inputFilePath.endsWith('.tsx');
      const hasJSXSupport = inputFilePath.endsWith('.jsx');
      const isLegacyWebArch = arch.includes('legacy');

      var swcOptions = {
        jsc: {
          ...(!isLegacyWebArch && { target: 'es2015' }),
          parser: {
            syntax: isTypescriptSyntax ? 'typescript' : 'ecmascript',
            jsx: hasJSXSupport,
            tsx: hasTSXSupport,
          },
        },
        module: { type: 'es6' },
        minify: false,
        sourceMaps: true,
        filename,
        sourceFileName: filename,
        ...(isLegacyWebArch && {
          env: { targets: lastModifiedSwcLegacyConfig || {} },
        }),
      };

      // Merge with app-level SWC config
      if (lastModifiedSwcConfig) {
        swcOptions = deepMerge(swcOptions, lastModifiedSwcConfig, [
          'env.targets',
          'module.type',
        ]);
      }

      this.inferExtraSWCOptions(inputFile, swcOptions, cacheOptions.cacheDeps);

      if (!!this.extraFeatures?.swc && this.modifyConfig) {
        this.modifyConfig(swcOptions, inputFile);
      }

      // Resolve custom baseUrl to an absolute path pointing to the project root
      if (swcOptions.jsc && swcOptions.jsc.baseUrl) {
        swcOptions.jsc.baseUrl = path.resolve(process.cwd(), swcOptions.jsc.baseUrl);
      }

      return swcOptions;
    };

    var babelOptions = { filename };
    try {
      var result = (() => {
        const isNodeModulesCode = packageName == null && inputFilePath.includes("node_modules/");
        const isAppCode = packageName == null && !isNodeModulesCode;
        const isPackageCode = packageName != null;
        const isLegacyWebArch = arch.includes('legacy');

        const config = lastModifiedMeteorConfig?.modern?.transpiler;
        const hasModernTranspiler = config != null && config !== false;
        const shouldSkipSwc =
          !hasModernTranspiler ||
          (isAppCode && config?.excludeApp === true) ||
          (isNodeModulesCode && config?.excludeNodeModules === true) ||
          (isPackageCode && config?.excludePackages === true) ||
          (isLegacyWebArch && config?.excludeLegacy === true) ||
          (isAppCode &&
            Array.isArray(config?.excludeApp) &&
            isExcludedConfig(inputFilePath, config?.excludeApp || [])) ||
          (isNodeModulesCode &&
            Array.isArray(config?.excludeNodeModules) &&
            (isExcludedConfig(inputFilePath, config?.excludeNodeModules || []) ||
              isExcludedConfig(
                inputFilePath.replace('node_modules/', ''),
                config?.excludeNodeModules || [],
                true,
              ))) ||
          (isPackageCode &&
            Array.isArray(config?.excludePackages) &&
            (isExcludedConfig(packageName, config?.excludePackages || []) ||
              isExcludedConfig(
                `${packageName}/${inputFilePath}`,
                config?.excludePackages || [],
              )));

        const cacheKey = [
          toBeAdded.hash,
          lastModifiedSwcConfigTime,
          isLegacyWebArch ? 'legacy' : '',
        ]
          .filter(Boolean)
          .join('-');
        // Determine if SWC should be used based on package and file criteria.
        const shouldUseSwc =
          (!shouldSkipSwc || this.extraFeatures?.swc) &&
          !this._swcIncompatible[cacheKey];
        let compilation;
        try {
          let usedSwc = false;
          if (shouldUseSwc) {
            // Create a cache key based on the source hash and the compiler used
            // Check cache
            compilation = this.readFromSwcCache({ cacheKey });
            // Return cached result if found.
            if (compilation) {
              if (this.isVerbose(config)) {
                logTranspilation({
                  usedSwc: true,
                  inputFilePath,
                  packageName,
                  isNodeModulesCode,
                  cacheHit: true,
                  arch,
                });
              }
              return compilation;
            }

            const swcOptions = setupSWCOptions();
            compilation = compileWithSwc(
              source,
              swcOptions,
              { features },
            );
            // Save result in cache
            this.writeToSwcCache({ cacheKey, compilation });
            usedSwc = true;
          } else {
            // Set up Babel options only when compiling with Babel
            babelOptions = setupBabelOptions();

            compilation = compileWithBabel(source, babelOptions, cacheOptions);
            usedSwc = false;
          }

          if (this.isVerbose(config)) {
            logTranspilation({
              usedSwc,
              inputFilePath,
              packageName,
              isNodeModulesCode,
              cacheHit: false,
              arch,
            });
          }
        } catch (e) {
          this._swcIncompatible[cacheKey] = true;
          // If SWC fails, fall back to Babel

          babelOptions = setupBabelOptions();
          compilation = compileWithBabel(source, babelOptions, cacheOptions);
          if (this.isVerbose(config)) {
            logTranspilation({
              usedSwc: false,
              inputFilePath,
              packageName,
              isNodeModulesCode,
              cacheHit: false,
              arch,
              errorMessage: e?.message,
              ...(e?.message?.includes(
                'cannot be used outside of module code',
              ) && {
                tip: 'Remove nested imports or replace them with require to support SWC and improve speed.',
              }),
            });
          }
        }

        return compilation;
      })();
    } catch (e) {
      if (e.loc) {
        // Error is from @babel/parser.
        inputFile.error({
          message: e.message,
          line: e.loc.line,
          column: e.loc.column,
        });
      } else {
        // Error is from a Babel transform, with line/column information
        // embedded in e.message.
        inputFile.error(e);
      }

      return null;
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

    // The babelOptions.sourceMapTarget option was deprecated in Babel
    // 7.0.0-beta.41: https://github.com/babel/babel/pull/7500
    result.map.file = babelOptions.filename + ".map";

    toBeAdded.sourceMap = result.map;
  }

  return toBeAdded;
};

function shouldCompileModulesOnly(path) {
  const parts = path.split("/");
  const nmi = parts.lastIndexOf("node_modules");
  if (nmi >= 0) {
    const part1 = parts[nmi + 1];
    // We trust that any code related to @babel/runtime has already been
    // compiled adequately. The @babel/runtime/helpers/typeof module is a
    // good example of why double-compilation is risky for these packages,
    // since it uses native typeof syntax to implement its polyfill for
    // Symbol-aware typeof, so compiling it again would cause the
    // generated code to try to require itself. In general, compiling code
    // more than once with Babel should be safe (just unnecessary), except
    // for code that Babel itself relies upon at runtime. Finally, if this
    // hard-coded list of package names proves to be incomplete, we can
    // always add to it (or even replace it completely) by releasing a new
    // version of the babel-compiler package.
    if (part1 === "@babel" ||
        part1 === "core-js" ||
        part1 === "regenerator-runtime") {
      return true;
    }
  }

  return false;
}

BCp.setDiskCacheDirectory = function (cacheDir) {
  this.cacheDirectory = cacheDir;
};

function profile(name, func) {
  if (typeof Profile !== 'undefined') {
    return Profile.time(name, func);
  } else {
    return func();
  }
};

BCp.inferTypeScriptConfig = function (features, inputFile, cacheDeps) {
  if (features.typescript && inputFile.findControlFile) {
    const tsconfigPath = inputFile.findControlFile("tsconfig.json");
    if (tsconfigPath) {
      if (typeof features.typescript !== "object") {
        features.typescript = Object.create(null);
      }
      Object.assign(features.typescript, { tsconfigPath });
      return true;
    }
  }
  return false;
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

BCp.inferExtraSWCOptions = function (inputFile, swcOptions, cacheDeps) {
  if (! inputFile.require ||
      ! inputFile.findControlFile ||
      ! inputFile.readAndWatchFile) {
    return false;
  }
  return this._inferFromSwcRc(inputFile, swcOptions, cacheDeps);
};

BCp._inferFromBabelRc = function (inputFile, babelOptions, cacheDeps) {
  var babelrcPath = inputFile.findControlFile(".babelrc");
  if (babelrcPath) {
    if (! hasOwn.call(this._babelrcCache, babelrcPath)) {
      try {
        this._babelrcCache[babelrcPath] = {
          controlFilePath: babelrcPath,
          controlFileData: JSON5.parse(
            inputFile.readAndWatchFile(babelrcPath)),
          deps: Object.create(null),
        };
      } catch (e) {
        if (e instanceof SyntaxError) {
          e.message = ".babelrc is not a valid JSON5 file: " + e.message;
        }
        throw e;
      }
    }

    const cacheEntry = this._babelrcCache[babelrcPath];

    if (this._inferHelper(inputFile, cacheEntry)) {
      merge(babelOptions, cacheEntry, "presets");
      merge(babelOptions, cacheEntry, "plugins");
      Object.assign(cacheDeps, cacheEntry.deps);
      return true;
    }
  }
};

BCp._inferFromPackageJson = function (inputFile, babelOptions, cacheDeps) {
  var pkgJsonPath = inputFile.findControlFile("package.json");
  if (pkgJsonPath) {
    const cacheEntry = hasOwn.call(this._babelrcCache, pkgJsonPath)
      ? this._babelrcCache[pkgJsonPath]
      : this._babelrcCache[pkgJsonPath] = {
          controlFilePath: pkgJsonPath,
          controlFileData: JSON.parse(
            inputFile.readAndWatchFile(pkgJsonPath)
          ).babel || null,
          deps: Object.create(null),
        };

    if (this._inferHelper(inputFile, cacheEntry)) {
      merge(babelOptions, cacheEntry, "presets");
      merge(babelOptions, cacheEntry, "plugins");
      Object.assign(cacheDeps, cacheEntry.deps);
      return true;
    }
  }
};

BCp._inferFromSwcRc = function (inputFile, swcOptions, cacheDeps) {
  var swcrcPath = inputFile.findControlFile(".swcrc");
  if (swcrcPath) {
    if (! hasOwn.call(this._babelrcCache, swcrcPath)) {
      try {
        this._babelrcCache[swcrcPath] = {
          controlFilePath: swcrcPath,
          controlFileData: JSON.parse(
            inputFile.readAndWatchFile(swcrcPath)),
          deps: Object.create(null),
        };
      } catch (e) {
        if (e instanceof SyntaxError) {
          e.message = ".swcrc is not a valid JSON file: " + e.message;
        }
        throw e;
      }
    }

    const cacheEntry = this._babelrcCache[swcrcPath];

    if (this._inferHelperForSwc(inputFile, cacheEntry)) {
      deepMerge(swcOptions, cacheEntry.controlFileData);
      Object.assign(cacheDeps, cacheEntry.deps);
      return true;
    }
  }
};

BCp._inferHelperForSwc = function (inputFile, cacheEntry) {
  if (! cacheEntry.controlFileData) {
    return false;
  }

  if (hasOwn.call(cacheEntry, "finalInferHelperForSwcResult")) {
    // We've already run _inferHelperForSwc and populated
    // cacheEntry.controlFileData, so we can return early here.
    return cacheEntry.finalInferHelperForSwcResult;
  }

  // First, ensure that the current file path is not excluded.
  if (cacheEntry.controlFileData.exclude) {
    const exclude = cacheEntry.controlFileData.exclude;
    const path = inputFile.getPathInPackage();

    if (exclude instanceof Array) {
      for (let i = 0; i < exclude.length; ++i) {
        if (path.match(exclude[i])) {
          return cacheEntry.finalInferHelperForSwcResult = false;
        }
      }
    } else if (path.match(exclude)) {
      return cacheEntry.finalInferHelperForSwcResult = false;
    }
  }

  return cacheEntry.finalInferHelperForSwcResult = true;
};

BCp._inferHelper = function (inputFile, cacheEntry) {
  if (! cacheEntry.controlFileData) {
    return false;
  }

  if (hasOwn.call(cacheEntry, "finalInferHelperResult")) {
    // We've already run _inferHelper and populated
    // cacheEntry.{presets,plugins}, so we can return early here.
    return cacheEntry.finalInferHelperResult;
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
          cacheEntry.deps[result.name] = result.version;
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
      return requireWithPrefixes(
        inputFile, id, prefixes,
        cacheEntry.controlFilePath
      );
    } catch (e) {
      if (e.code !== "MODULE_NOT_FOUND") {
        throw e;
      }

      if (! hasOwn.call(compiler._babelrcWarnings, id)) {
        compiler._babelrcWarnings[id] = cacheEntry.controlFilePath;

        console.error(
          "Warning: unable to resolve " +
            JSON.stringify(id) +
            " in " + path.join(".") +
            " of " + cacheEntry.controlFilePath + ", due to:"
        );

        console.error(e.stack || e);
      }

      return null;
    }
  }

  const { controlFileData } = cacheEntry;
  const clean = walkBabelRC(controlFileData);
  merge(cacheEntry, clean, "presets");
  merge(cacheEntry, clean, "plugins");

  if (controlFileData &&
      controlFileData.env) {
    const envKey =
      process.env.BABEL_ENV ||
      process.env.NODE_ENV ||
      "development";

    const clean = walkBabelRC(controlFileData.env[envKey]);

    if (clean) {
      merge(cacheEntry, clean, "presets");
      merge(cacheEntry, clean, "plugins");
    }
  }

  return cacheEntry.finalInferHelperResult =
    !! (cacheEntry.presets ||
        cacheEntry.plugins);
};

function merge(babelOptions, babelrc, name) {
  if (babelrc[name]) {
    var list = babelOptions[name] || [];
    babelOptions[name] = list;
    list.push.apply(list, babelrc[name]);
  }
}

const forbiddenPresetNames = new Set([
  // Since Meteor always includes babel-preset-meteor automatically, it's
  // likely a mistake for that preset to appear in a custom .babelrc
  // file. Previously we recommended that developers simply remove the
  // preset (e.g. #9631), but we can easily just ignore it by returning
  // null here, which seems like a better solution since it allows the
  // same .babelrc file to be used for other purposes, such as running
  // tests with a testing tool that needs to compile application code the
  // same way Meteor does.
  "babel-preset-meteor",
  // Similar reasoning applies to these commonly misused Babel presets:
  "@babel/preset-env",
  "@babel/preset-react",
]);

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
        if (inputFile.resolve(prefix + id, controlFilePath)) {
          presetOrPluginId = prefix + id;
        }

        presetOrPluginMeta = inputFile.require(
          packageNameFromTopLevelModuleId(prefix + id) + "/package.json",
          controlFilePath
        );

        return true;

      } catch (e) {
        if (e.code !== "MODULE_NOT_FOUND") {
          throw e;
        }

        return false;
      }
    });

    if (found) {
      if (forbiddenPresetNames.has(presetOrPluginMeta.name)) {
        return null;
      }

      presetOrPlugin = inputFile.require(
        presetOrPluginId,
        controlFilePath
      );
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

const SwcCacheContext = '.swc-cache';

BCp.readFromSwcCache = function({ cacheKey }) {
  // Check in-memory cache.
  let compilation = this._swcCache[cacheKey];
  // If not found, try file system cache if enabled.
  if (!compilation && this.cacheDirectory) {
    const cacheFilePath = path.join(this.cacheDirectory, SwcCacheContext, `${cacheKey}.json`);
    if (fs.existsSync(cacheFilePath)) {
      try {
        compilation = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        // Save back to in-memory cache.
        this._swcCache[cacheKey] = compilation;
      } catch (err) {
        // Ignore any errors reading/parsing the cache.
      }
    }
  }
  return compilation;
};

BCp.writeToSwcCache = function({ cacheKey, compilation }) {
  // Save to in-memory cache.
  this._swcCache[cacheKey] = compilation;
  // If file system caching is enabled, write asynchronously.
  if (this.cacheDirectory) {
    const cacheFilePath = path.join(this.cacheDirectory, SwcCacheContext, `${cacheKey}.json`);
    try {
      const writeFileCache = async () => {
        await fs.promises.mkdir(path.dirname(cacheFilePath), { recursive: true });
        await fs.promises.writeFile(cacheFilePath, JSON.stringify(compilation), 'utf8');
      };
      // Invoke without blocking the main flow.
      writeFileCache();
    } catch (err) {
      // If writing fails, ignore the error.
    }
  }
};

function getMeteorAppDir() {
  return process.cwd();
}

function getMeteorAppPackageJson() {
  return JSON.parse(
    fs.readFileSync(`${getMeteorAppDir()}/package.json`, 'utf-8'),
  );
}

function getMeteorAppSwcrc(file = '.swcrc') {
  try {
    const filePath = `${getMeteorAppDir()}/${file}`;
    if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf-8');
      // Check if the content uses ES module syntax (export default)
      if (content.includes('export default')) {
        // Transform ES module syntax to CommonJS
        content = content.replace(/export\s+default\s+/, 'module.exports = ');
      }
      const script = new vm.Script(`
        (function() {
          const module = {};
          module.exports = {};
          (function(exports, module) {
            ${content}
          })(module.exports, module);
          return module.exports;
        })()
      `);
      const context = vm.createContext({ process });
      return script.runInContext(context);
    } else {
      // For .swcrc and other JSON files, parse as JSON
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Error parsing ${file} file`, e);
  }
}

const _regexCache = new Map();

function isRegexLike(str) {
  return /[.*+?^${}()|[\]\\]/.test(str);
}

function isExcludedConfig(name, excludeList = [], startsWith) {
  if (!name || !excludeList?.length) return false;
  return excludeList.some(rule => {
    if (name === rule) return true;
    if (startsWith && name.startsWith(rule)) return true;
    if (isRegexLike(rule)) {
      let regex = _regexCache.get(rule);
      if (!regex) {
        try {
          regex = new RegExp(rule);
          _regexCache.set(rule, regex);
        } catch (err) {
          console.warn(`Invalid regex in exclude list: "${rule}"`);
          return false;
        }
      }
      return regex.test(name);
    }

    return false;
  });
}

const disableTextColors = Boolean(JSON.parse(process.env.METEOR_DISABLE_COLORS || "false"));

function color(text, code) {
  return disableTextColors ? text : `\x1b[${code}m${text}\x1b[0m`;
}

function logTranspilation({
  packageName,
  inputFilePath,
  usedSwc,
  cacheHit,
  isNodeModulesCode,
  arch,
  errorMessage = '',
  tip = '',
}) {
  const transpiler = usedSwc ? 'SWC' : 'Babel';
  const transpilerColor = usedSwc ? 32 : 33;
  const label = color('[Transpiler]', 36);
  const transpilerPart = `${label} Used ${color(
    transpiler,
    transpilerColor,
  )} for`;
  const filePathPadded = `${
    packageName ? `${packageName}/` : ''
  }${inputFilePath}`.padEnd(50);
  let rawOrigin = '';
  if (packageName) {
    rawOrigin = `(package)`;
  } else {
    rawOrigin = isNodeModulesCode ? '(node_modules)' : '(app)';
  }
  const originPaddedRaw = rawOrigin.padEnd(35);
  const originPaddedColored = packageName
    ? originPaddedRaw
    : isNodeModulesCode
    ? color(originPaddedRaw, 90)
    : color(originPaddedRaw, 35);
  const cacheStatus = errorMessage
    ? color('⚠️  Fallback', 33)
    : usedSwc
    ? cacheHit
      ? color('🟢 Cache hit', 32)
      : color('🔴 Cache miss', 31)
    : '';
  const archPart = arch ? color(` (${arch})`, 90) : '';
  console.log(
    `${transpilerPart} ${filePathPadded}${originPaddedColored}${cacheStatus}${archPart}`,
  );
  if (errorMessage) {
    console.log();
    console.log(`  ↳ ${color('Error:', 31)} ${errorMessage}`);
    if (tip) {
      console.log();
      console.log(`  ${color('💡 Tip:', 33)} ${tip}`);
    }
    console.log();
  }
}

function logConfigBlock(description, configObject) {
  const label = color('[Config]', 36);
  const descriptionColor = color(description, 90);

  console.log(`${label} ${descriptionColor}`);

  const configLines = JSON.stringify(configObject, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .split('\n')
    .map(line => '  ' + line);

  configLines.forEach(line => console.log(line));
  console.log();
}

function deepMerge(target, source, preservePaths = [], inPath = '') {
  for (const key in source) {
    const fullPath = inPath ? `${inPath}.${key}` : key;

    // Skip preserved paths
    if (preservePaths.includes(fullPath)) continue;

    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key])
    ) {
      target[key] = deepMerge(
        target[key] || {},
        source[key],
        preservePaths,
        fullPath,
      );
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function convertBabelTargetsForSwc(babelTargets) {
  const allowedEnvs = new Set([
    'chrome', 'opera', 'edge', 'firefox', 'safari',
    'ie', 'ios', 'android', 'node', 'electron'
  ]);

  const filteredTargets = {};
  for (const [env, version] of Object.entries(babelTargets)) {
    if (allowedEnvs.has(env)) {
      // Convert an array version (e.g., [10, 3]) into "10.3", otherwise convert to string.
      filteredTargets[env] = Array.isArray(version) ? version.join('.') : version.toString();
    }
  }

  return filteredTargets;
}

/**
 * A compiler that extends BabelCompiler but always uses SWC
 * @param {Object} extraFeatures Additional features to pass to BabelCompiler
 * @param {Function} modifyConfig Function to modify the configuration
 */
SwcCompiler = function SwcCompiler(extraFeatures, modifyConfig) {
  extraFeatures = extraFeatures || {};
  extraFeatures.swc = true;
  BabelCompiler.call(this, extraFeatures, modifyConfig);
};

// Inherit from BabelCompiler
SwcCompiler.prototype = Object.create(BabelCompiler.prototype);
SwcCompiler.prototype.constructor = SwcCompiler;
