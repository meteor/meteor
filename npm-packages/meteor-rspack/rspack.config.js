const { DefinePlugin, BannerPlugin, NormalModuleReplacementPlugin } = require('@rspack/core');
const fs = require('fs');
const { inspect } = require('node:util');
const path = require('path');
const { merge } = require('webpack-merge');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

const { cleanOmittedPaths, mergeSplitOverlap } = require("./lib/mergeRulesSplitOverlap.js");
const { getMeteorAppSwcConfig } = require('./lib/swc.js');
const HtmlRspackPlugin = require('./plugins/HtmlRspackPlugin.js');
const { RequireExternalsPlugin } = require('./plugins/RequireExtenalsPlugin.js');
const { AssetExternalsPlugin } = require('./plugins/AssetExternalsPlugin.js');
const { MeteorRspackOutputPlugin } = require('./plugins/MeteorRspackOutputPlugin.js');
const { generateEagerTestFile } = require("./lib/test.js");
const { getMeteorIgnoreEntries, createIgnoreGlobConfig } = require("./lib/ignore");
const {
  compileWithMeteor,
  compileWithRspack,
  setCache,
  splitVendorChunk,
  extendSwcConfig,
  replaceSwcConfig,
  makeWebNodeBuiltinsAlias,
  disablePlugins,
  outputMeteorRspack,
  enablePortableBuild,
} = require('./lib/meteorRspackHelpers.js');
const { loadUserAndOverrideConfig } = require('./lib/meteorRspackConfigHelpers.js');
const { prepareMeteorRspackConfig } = require("./lib/meteorRspackConfigFactory");

// Safe require that doesn't throw if the module isn't found
function safeRequire(moduleName) {
  try {
    return require(moduleName);
  } catch (error) {
    if (
      error.code === 'MODULE_NOT_FOUND' &&
      error.message.includes(moduleName)
    ) {
      return null;
    }
    throw error; // rethrow if it's a different error
  }
}

// Persistent filesystem cache strategy
function createCacheStrategy(
  mode,
  side,
  { projectConfigPath, configPath, buildContext } = {},
) {
  // Check for configuration files
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
  const hasTsconfig = fs.existsSync(tsconfigPath);
  const babelRcConfig = path.join(process.cwd(), '.babelrc');
  const hasBabelRcConfig = fs.existsSync(babelRcConfig);
  const babelJsConfig = path.join(process.cwd(), 'babel.config.js');
  const hasBabelJsConfig = fs.existsSync(babelJsConfig);
  const swcrcPath = path.join(process.cwd(), '.swcrc');
  const hasSwcrcConfig = fs.existsSync(swcrcPath);
  const swcJsPath = path.join(process.cwd(), 'swc.config.js');
  const hasSwcJsConfig = fs.existsSync(swcJsPath);
  const swcTsPath = path.join(process.cwd(), 'swc.config.ts');
  const hasSwcTsConfig = fs.existsSync(swcTsPath);
  const postcssConfigPath = path.join(process.cwd(), 'postcss.config.js');
  const hasPostcssConfig = fs.existsSync(postcssConfigPath);
  const packageLockPath = path.join(process.cwd(), 'package-lock.json');
  const hasPackageLock = fs.existsSync(packageLockPath);
  const yarnLockPath = path.join(process.cwd(), 'yarn.lock');
  const hasYarnLock = fs.existsSync(yarnLockPath);

  // Build dependencies array
  const buildDependencies = [
    ...(projectConfigPath ? [projectConfigPath] : []),
    ...(configPath ? [configPath] : []),
    ...(hasTsconfig ? [tsconfigPath] : []),
    ...(hasBabelRcConfig ? [babelRcConfig] : []),
    ...(hasBabelJsConfig ? [babelJsConfig] : []),
    ...(hasSwcrcConfig ? [swcrcPath] : []),
    ...(hasSwcJsConfig ? [swcJsPath] : []),
    ...(hasSwcTsConfig ? [swcTsPath] : []),
    ...(hasPostcssConfig ? [postcssConfigPath] : []),
    ...(hasPackageLock ? [packageLockPath] : []),
    ...(hasYarnLock ? [yarnLockPath] : []),
  ].filter(Boolean);

  return {
    cache: true,
    experiments: {
      cache: {
        version: `cache-${mode}${(side && `-${side}`) || ""}`,
        type: "persistent",
        storage: {
          type: "filesystem",
          directory: `node_modules/.cache/rspack/${
            [buildContext, side].filter(Boolean).join('-') || 'default'
          }`,
        },
        ...(buildDependencies.length > 0 && {
          buildDependencies: buildDependencies,
        })
      },
    },
  };
}

// SWC loader rule (JSX/JS)
function createSwcConfig({
  isTypescriptEnabled,
  isReactEnabled,
  isJsxEnabled,
  isTsxEnabled,
  externalHelpers,
  isDevEnvironment,
  isClient,
  isAngularEnabled,
}) {
  const defaultConfig = {
    jsc: {
      baseUrl: process.cwd(),
      paths: { '/*': ['*', '/*'] },
      parser: {
        syntax: isTypescriptEnabled ? 'typescript' : 'ecmascript',
        ...(isTsxEnabled && { tsx: true }),
        ...(isJsxEnabled && { jsx: true }),
        ...(isAngularEnabled && { decorators: true }),
      },
      target: 'es2015',
      ...(isReactEnabled && {
        transform: {
          react: {
            development: isDevEnvironment,
            ...(isClient && { refresh: isDevEnvironment }),
          },
        },
      }),
      externalHelpers,
    },
  };

  // Swcrc config not customizable
  const omitPaths = [
    'jsc.target',
  ];
  // Define warning function
  const warningFn = path => {
    console.warn(
      `[.swcrc] Ignored custom "${path}" — reserved for Meteor-Rspack integration.`,
    );
  };
  const customConfig = getMeteorAppSwcConfig() || {};
  const cleanedCustomConfig = cleanOmittedPaths(customConfig, { omitPaths, warningFn });
  const swcConfig = merge(defaultConfig, cleanedCustomConfig);
  return {
    test: /\.(?:[mc]?js|jsx|[mc]?ts|tsx)$/i,
    exclude: /node_modules|\.meteor\/local/,
    loader: "builtin:swc-loader",
    options: swcConfig,
  };
}

function createRemoteDevServerConfig() {
  const rootUrl = process.env.ROOT_URL;
  let hostname;
  let protocol;
  let port;

  if (rootUrl) {
    try {
      const url = new URL(rootUrl);
      // Detect if it's remote (not localhost or 127.x)
      const isLocal =
        url.hostname.includes('localhost') ||
        url.hostname.startsWith('127.') ||
        url.hostname.endsWith('.local');
      if (!isLocal) {
        hostname = url.hostname;
        protocol = url.protocol === 'https:' ? 'wss' : 'ws';
        port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);

        return {
          client: {
            webSocketURL: {
              hostname,
              port,
              protocol,
            },
          },
        };
      }
    } catch (err) {
      console.warn(`Invalid ROOT_URL "${rootUrl}", falling back to localhost`);
    }
  }

  // If local doesn't provide any extra config
  return {};
}

// Keep files outside of build folders
function keepOutsideBuild() {
  return (p) => {
    const normalized = '/' + path.normalize(p).replaceAll(path.sep, '/').replace(/^\/+/, '');
    const isInBuildRoot = /\/build(\/|$)/.test(normalized);
    const isInBuildStar = /\/build-[^/]+(\/|$)/.test(normalized);
    return !(isInBuildRoot || isInBuildStar);
  };
}

/**
 * @param {{ isClient: boolean; isServer: boolean; isDevelopment?: boolean; isProduction?: boolean; isTest?: boolean }} Meteor
 * @param {{ mode?: string; clientEntry?: string; serverEntry?: string; clientOutputFolder?: string; serverOutputFolder?: string; chunksContext?: string; assetsContext?: string; serverAssetsContext?: string }} argv
 * @returns {Promise<import('@rspack/cli').Configuration[]>}
 */
module.exports = async function (inMeteor = {}, argv = {}) {
  // Transform Meteor env properties to proper boolean values
  const Meteor = { ...inMeteor };
  // Convert string boolean values to actual booleans
  for (const key in Meteor) {
    if (Meteor[key] === "true" || Meteor[key] === true) {
      Meteor[key] = true;
    } else if (Meteor[key] === "false" || Meteor[key] === false) {
      Meteor[key] = false;
    }
  }

  const isTestLike = !!Meteor.isTestLike;
  const swcExternalHelpers = !!Meteor.swcExternalHelpers;
  const isNative = !!Meteor.isNative;
  const devServerPort = Meteor.devServerPort || 8080;

  const projectDir = process.cwd();
  const projectConfigPath =
    Meteor.projectConfigPath || path.resolve(projectDir, "rspack.config.js");

  // Determine context for bundles and assets
  const meteorLocalDirName = process.env.METEOR_LOCAL_DIR
    ? path.basename(process.env.METEOR_LOCAL_DIR.replace(/\\/g, "/"))
    : "";
  const buildContext =
    Meteor.buildContext ||
    process.env.RSPACK_BUILD_CONTEXT ||
    `_build${(meteorLocalDirName && `-${meteorLocalDirName}`) || ""}`;
  const assetsContext =
    Meteor.assetsContext ||
    process.env.RSPACK_ASSETS_CONTEXT ||
    `build-assets${(meteorLocalDirName && `-${meteorLocalDirName}`) || ""}`;
  const chunksContext =
    Meteor.chunksContext ||
    process.env.RSPACK_CHUNKS_CONTEXT ||
    `build-chunks${(meteorLocalDirName && `-${meteorLocalDirName}`) || ""}`;

  // Compute build paths before loading user config (needed by Meteor helpers below)
  const outputPath = Meteor.outputPath;
  const outputDir = path.dirname(Meteor.outputPath || "");
  Meteor.buildOutputDir = path.resolve(projectDir, buildContext, outputDir);

  // Meteor flags derived purely from input; independent of loaded user/override configs
  const isTest = !!Meteor.isTest;
  const isClient = !!Meteor.isClient;
  const isServer = !!Meteor.isServer;
  const isRun = !!Meteor.isRun;
  const isBuild = !!Meteor.isBuild;
  const isReactEnabled = !!Meteor.isReactEnabled;
  const isTestModule = !!Meteor.isTestModule;
  const isTestEager = !!Meteor.isTestEager;
  const isTestFullApp = !!Meteor.isTestFullApp;
  const isProfile = !!Meteor.isProfile;
  const isVerbose = !!Meteor.isVerbose;
  const configPath = Meteor.configPath;
  const testEntry = Meteor.testEntry;

  const isTypescriptEnabled = Meteor.isTypescriptEnabled || false;
  const isJsxEnabled =
    Meteor.isJsxEnabled || (!isTypescriptEnabled && isReactEnabled) || false;
  const isTsxEnabled =
    Meteor.isTsxEnabled || (isTypescriptEnabled && isReactEnabled) || false;
  const isBundleVisualizerEnabled = Meteor.isBundleVisualizerEnabled || false;
  const isAngularEnabled = Meteor.isAngularEnabled || false;
  const enableSwcExternalHelpers = !isServer && swcExternalHelpers;

  // Defined here so it can be called both before and after the first config load;
  // without loaded configs it falls through to argv/Meteor flags.
  const getModeFromConfig = (userConfig, overrideConfig) => {
    if (overrideConfig?.mode) return overrideConfig.mode;
    if (userConfig?.mode) return userConfig.mode;
    if (argv.mode) return argv.mode;
    if (Meteor.isProduction) return "production";
    if (Meteor.isDevelopment) return "development";
    return null;
  };

  // Initial mode before user/override configs are loaded
  const initialCurrentMode = getModeFromConfig();
  const initialIsProd = initialCurrentMode
    ? initialCurrentMode === "production"
    : !!Meteor.isProduction;
  const initialIsDev = initialCurrentMode
    ? initialCurrentMode === "development"
    : !!Meteor.isDevelopment || !initialIsProd;
  const initialMode = initialIsProd ? "production" : "development";

  // Initialized with pre-load values so helpers work during the first config load;
  // reassigned after load once mode is fully resolved.
  let cacheStrategy = createCacheStrategy(
    initialMode,
    (Meteor.isClient && "client") || "server",
    { projectConfigPath, configPath, buildContext }
  );
  let swcConfigRule = createSwcConfig({
    isTypescriptEnabled,
    isReactEnabled,
    isJsxEnabled,
    isTsxEnabled,
    externalHelpers: enableSwcExternalHelpers,
    isDevEnvironment: isRun && initialIsDev && !isTest && !isNative,
    isClient,
    isAngularEnabled,
  });
  Meteor.swcConfigOptions = swcConfigRule.options;

  // Expose Meteor's helpers to expand Rspack configs
  Meteor.compileWithMeteor = (deps) => compileWithMeteor(deps);
  Meteor.compileWithRspack = (deps, options = {}) =>
    compileWithRspack(deps, {
      options: mergeSplitOverlap(Meteor.swcConfigOptions, options),
    });
  Meteor.setCache = (enabled) =>
    setCache(!!enabled, enabled === "memory" ? undefined : cacheStrategy);
  Meteor.splitVendorChunk = () => splitVendorChunk();
  Meteor.extendSwcConfig = (customSwcConfig) =>
    extendSwcConfig(
      mergeSplitOverlap(Meteor.swcConfigOptions, customSwcConfig)
    );
  Meteor.replaceSwcConfig = (customSwcConfig) =>
    replaceSwcConfig(customSwcConfig);
  Meteor.extendConfig = (...configs) => mergeSplitOverlap(...configs);
  Meteor.disablePlugins = (matchers) =>
    prepareMeteorRspackConfig({
      disablePlugins: matchers,
    });
  Meteor.enablePortableBuild = () => enablePortableBuild();

  // Add HtmlRspackPlugin function to Meteor
  Meteor.HtmlRspackPlugin = (options = {}) => {
    return new HtmlRspackPlugin({
      inject: false,
      cache: true,
      filename: `../${buildContext}/${outputDir}/index.html`,
      templateContent: `
          <head>
            <% for tag in htmlRspackPlugin.tags.headTags { %>
              <%= toHtml(tag) %>
            <% } %>
          </head>
          <body>
            <% for tag in htmlRspackPlugin.tags.bodyTags { %>
              <%= toHtml(tag) %>
            <% } %>
          </body>
        `,
      ...options,
    });
  };

  // First pass: resolve user/override configs early so mode overrides (e.g. "production")
  // are available before computing isProd/isDev and the rest of the build flags.
  // Skipped for Angular since it manages its own mode via the second pass.
  let { nextUserConfig, nextOverrideConfig } = isAngularEnabled
    ? {}
    : await loadUserAndOverrideConfig(projectConfigPath, Meteor, argv);

  // Determine the final mode with loaded configs
  const currentMode = getModeFromConfig(nextUserConfig, nextOverrideConfig);
  const isProd = currentMode
    ? currentMode === "production"
    : !!Meteor.isProduction;
  const isDev = currentMode
    ? currentMode === "development"
    : !!Meteor.isDevelopment || !isProd;
  const mode = isProd ? "production" : "development";
  const isPortableBuild = !!(
    nextUserConfig?.["meteor.enablePortableBuild"] ||
    nextOverrideConfig?.["meteor.enablePortableBuild"]
  );

  // Determine entry points
  const entryPath = Meteor.entryPath || "";

  // Determine output points
  const outputFilename = Meteor.outputFilename;

  cacheStrategy = createCacheStrategy(
    mode,
    (Meteor.isClient && "client") || "server",
    { projectConfigPath, configPath }
  );

  // Determine run point
  const runPath = Meteor.runPath || "";

  // Determine banner
  const bannerOutput = JSON.parse(
    Meteor.bannerOutput || process.env.RSPACK_BANNER || '""'
  );

  // Determine output directories
  const clientOutputDir = path.resolve(projectDir, "public");
  const serverOutputDir = path.resolve(projectDir, "private");

  // Get Meteor ignore entries
  const meteorIgnoreEntries = getMeteorIgnoreEntries(projectDir);

  // Additional ignore entries
  const additionalEntries = [
    "**/.meteor/local/**",
    "**/dist/**",
    ...(isTest && isTestEager
      ? [`**/${buildContext}/**`, "**/.meteor/local/**", "node_modules/**"]
      : []),
  ];

  // Set default watch options
  const watchOptions = {
    ignored: [
      ...createIgnoreGlobConfig([...meteorIgnoreEntries, ...additionalEntries]),
    ],
  };

  if (Meteor.isDebug || Meteor.isVerbose) {
    console.log("[i] Rspack mode:", mode);
    console.log("[i] Meteor flags:", Meteor);
  }

  const isDevEnvironment = isRun && isDev && !isTest && !isNative;
  swcConfigRule = createSwcConfig({
    isTypescriptEnabled,
    isReactEnabled,
    isJsxEnabled,
    isTsxEnabled,
    externalHelpers: enableSwcExternalHelpers,
    isDevEnvironment,
    isClient,
    isAngularEnabled,
  });
  Meteor.swcConfigOptions = swcConfigRule.options;

  const externals = [
    /^meteor\/.*/,
    ...(isReactEnabled ? [/^react$/, /^react-dom$/] : []),
    ...(isServer ? [/^bcrypt$/] : []),
  ];
  const alias = {
    "/": path.resolve(process.cwd()),
  };
  const fallback = {
    ...(isClient && makeWebNodeBuiltinsAlias()),
  };
  const extensions = [
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".wasm",
  ];
  const extraRules = [];

  const reactRefreshModule = isReactEnabled
    ? safeRequire("@rspack/plugin-react-refresh")
    : null;

  const requireExternalsPlugin = new RequireExternalsPlugin({
    filePath: path.join(buildContext, runPath),
    ...(Meteor.isBlazeEnabled && {
      externals: /\.html$/,
      isEagerImport: (module) => module.endsWith(".html"),
      ...(isProd && {
        lastImports: [`./${outputFilename}`],
      }),
    }),
    enableGlobalPolyfill: isDevEnvironment && !isServer,
  });

  // Handle assets
  const assetExternalsPlugin = new AssetExternalsPlugin();
  const assetModuleFilename = (_fileInfo) => {
    const filename = _fileInfo.filename;
    const isPublic = filename.startsWith("/") || filename.startsWith("public");
    if (isPublic) return `[name][ext][query]`;
    return `${assetsContext}/[hash][ext][query]`;
  };

  const rsdoctorModule = isBundleVisualizerEnabled
    ? safeRequire("@rsdoctor/rspack-plugin")
    : null;
  const doctorPluginConfig =
    isRun && isBundleVisualizerEnabled && rsdoctorModule?.RsdoctorRspackPlugin
      ? [
          new rsdoctorModule.RsdoctorRspackPlugin({
            port: isClient
              ? parseInt(Meteor.rsdoctorClientPort || "8888", 10)
              : parseInt(Meteor.rsdoctorServerPort || "8889", 10),
          }),
        ]
      : [];
  const bannerPluginConfig = !isBuild
    ? [
        new BannerPlugin({
          banner: bannerOutput,
          entryOnly: true,
        }),
      ]
    : [];
  // Not supported in Meteor yet (Rspack 1.7+ is enabled by default)
  const lazyCompilationConfig = { lazyCompilation: false };
  const shouldLogVerbose = isProfile || isVerbose;
  const loggingConfig = shouldLogVerbose
    ? {}
    : { stats: "errors-warnings", infrastructureLogging: { level: "warn" } };

  const clientEntry =
    isClient && isTest && isTestEager && isTestFullApp
      ? generateEagerTestFile({
          isAppTest: true,
          projectDir,
          buildContext,
          ignoreEntries: ["**/server/**"],
          meteorIgnoreEntries,
          prefix: "client",
          extraEntry: path.resolve(process.cwd(), Meteor.mainClientEntry),
          globalImportPath: path.resolve(projectDir, buildContext, entryPath),
        })
      : isClient && isTest && isTestEager
      ? generateEagerTestFile({
          isAppTest: false,
          isClient: true,
          projectDir,
          buildContext,
          ignoreEntries: ["**/server/**"],
          meteorIgnoreEntries,
          prefix: "client",
          globalImportPath: path.resolve(projectDir, buildContext, entryPath),
        })
      : isClient && isTest && testEntry
      ? path.resolve(process.cwd(), testEntry)
      : path.resolve(process.cwd(), buildContext, entryPath);
  const clientNameConfig = `[${(isTest && "test-") || ""}client-rspack]`;
  // Base client config
  let clientConfig = {
    name: clientNameConfig,
    target: "web",
    mode,
    entry: clientEntry,
    output: {
      path: clientOutputDir,
      filename: (_module) => {
        const chunkName = _module.chunk?.name;
        const isMainChunk = !chunkName || chunkName === "main";
        const chunkSuffix = `${chunksContext}/[id]${
          isProd ? ".[chunkhash]" : ""
        }.js`;
        if (isDevEnvironment) {
          if (isMainChunk) return outputFilename;
          return chunkSuffix;
        }
        if (isMainChunk) return `../${buildContext}/${outputPath}`;
        return chunkSuffix;
      },
      libraryTarget: "commonjs2",
      publicPath: "/",
      chunkFilename: `${chunksContext}/[id]${isProd ? ".[chunkhash]" : ""}.js`,
      assetModuleFilename,
      cssFilename: `${chunksContext}/[name]${
        isProd ? ".[contenthash]" : ""
      }.css`,
      cssChunkFilename: `${chunksContext}/[id]${
        isProd ? ".[contenthash]" : ""
      }.css`,
      ...(isProd && { clean: { keep: keepOutsideBuild() } }),
    },
    optimization: {
      usedExports: true,
      splitChunks: { chunks: "async" },
    },
    module: {
      rules: [
        swcConfigRule,
        ...(Meteor.isBlazeEnabled
          ? [
              {
                test: /\.html$/i,
                loader: "ignore-loader",
              },
            ]
          : []),
        ...extraRules,
      ],
    },
    resolve: { extensions, alias, fallback },
    externals,
    plugins: [
      ...[
        ...(isReactEnabled && reactRefreshModule && isDevEnvironment
          ? [new reactRefreshModule()]
          : []),
        requireExternalsPlugin,
        assetExternalsPlugin,
      ].filter(Boolean),
      new DefinePlugin({
        "Meteor.isClient": JSON.stringify(true),
        "Meteor.isServer": JSON.stringify(false),
        "Meteor.isTest": JSON.stringify(isTestLike && !isTestFullApp),
        "Meteor.isAppTest": JSON.stringify(isTestLike && isTestFullApp),
        ...(!isPortableBuild && {
          "Meteor.isDevelopment": JSON.stringify(isDev),
          "Meteor.isProduction": JSON.stringify(isProd),
        }),
      }),
      ...bannerPluginConfig,
      Meteor.HtmlRspackPlugin(),
      ...doctorPluginConfig,
      new NormalModuleReplacementPlugin(/^node:(.*)$/, (res) => {
        res.request = res.request.replace(/^node:/, "");
      }),
    ],
    watchOptions,
    devtool:
      isDevEnvironment || isNative || isTest
        ? "source-map"
        : "hidden-source-map",
    ...(isDevEnvironment && {
      devServer: {
        ...createRemoteDevServerConfig(),
        static: { directory: clientOutputDir, publicPath: "/__rspack__/" },
        hot: true,
        liveReload: true,
        ...(Meteor.isBlazeEnabled && { hot: false }),
        port: devServerPort,
        devMiddleware: {
          writeToDisk: (filePath) =>
            /\.(html)$/.test(filePath) && !filePath.includes(".hot-update."),
        },
        onListening(devServer) {
          if (!devServer) return;
          const { host, port } = devServer.options;
          const protocol =
            devServer.options.server?.type === "https" ? "https" : "http";
          const devServerUrl = `${protocol}://${host || "localhost"}:${port}`;
          outputMeteorRspack({ devServerUrl });
        },
      },
    }),
    ...merge(cacheStrategy, { experiments: { css: true } }),
    ...lazyCompilationConfig,
    ...loggingConfig,
  };

  const serverEntry =
    isServer && isTest && isTestEager && isTestFullApp
      ? generateEagerTestFile({
          isAppTest: true,
          projectDir,
          buildContext,
          ignoreEntries: ["**/client/**"],
          meteorIgnoreEntries,
          prefix: "server",
          globalImportPath: path.resolve(projectDir, buildContext, entryPath),
        })
      : isServer && isTest && isTestEager
      ? generateEagerTestFile({
          isAppTest: false,
          projectDir,
          buildContext,
          ignoreEntries: ["**/client/**"],
          meteorIgnoreEntries,
          prefix: "server",
          globalImportPath: path.resolve(projectDir, buildContext, entryPath),
        })
      : isServer && isTest && testEntry
      ? path.resolve(process.cwd(), testEntry)
      : path.resolve(projectDir, buildContext, entryPath);
  const serverNameConfig = `[${(isTest && "test-") || ""}server-rspack]`;
  // Base server config
  let serverConfig = {
    name: serverNameConfig,
    target: "node",
    mode,
    entry: serverEntry,
    output: {
      path: serverOutputDir,
      filename: () => `../${buildContext}/${outputPath}`,
      libraryTarget: "commonjs2",
      chunkFilename: `${chunksContext}/[id]${isProd ? ".[chunkhash]" : ""}.js`,
      assetModuleFilename,
      ...(isProd && { clean: { keep: keepOutsideBuild() } }),
    },
    optimization: {
      usedExports: true,
      splitChunks: false,
      runtimeChunk: false,
    },
    module: {
      rules: [swcConfigRule, ...extraRules],
      parser: {
        javascript: {
          // Dynamic imports on the server are treated as bundled in the same chunk
          dynamicImportMode: "eager",
        },
      },
    },
    resolve: {
      extensions,
      alias,
      modules: ["node_modules", path.resolve(projectDir)],
      conditionNames: ["import", "require", "node", "default"],
    },
    externals,
    externalsPresets: { node: true },
    plugins: [
      new DefinePlugin(
        isTest && (isTestModule || isTestEager)
          ? {
              "Meteor.isTest": JSON.stringify(isTest && !isTestFullApp),
              "Meteor.isAppTest": JSON.stringify(isTest && isTestFullApp),
              ...(!isPortableBuild && {
                "Meteor.isDevelopment": JSON.stringify(isDev),
              }),
            }
          : {
              "Meteor.isClient": JSON.stringify(false),
              "Meteor.isServer": JSON.stringify(true),
              "Meteor.isTest": JSON.stringify(isTestLike && !isTestFullApp),
              "Meteor.isAppTest": JSON.stringify(isTestLike && isTestFullApp),
              ...(!isPortableBuild && {
                "Meteor.isDevelopment": JSON.stringify(isDev),
                "Meteor.isProduction": JSON.stringify(isProd),
              }),
            }
      ),
      ...bannerPluginConfig,
      requireExternalsPlugin,
      assetExternalsPlugin,
      ...doctorPluginConfig,
    ],
    watchOptions,
    devtool:
      isDevEnvironment || isNative || isTest
        ? "source-map"
        : "hidden-source-map",
    ...((isDevEnvironment || (isTest && !isTestEager) || isNative) &&
      cacheStrategy),
    ...lazyCompilationConfig,
    ...loggingConfig,
  };

  // Establish Angular overrides to ensure proper integration
  const angularExpandConfig = isAngularEnabled
    ? {
        mode: isProd ? "production" : "development",
        devServer: { port: devServerPort },
        stats: { preset: "normal" },
        infrastructureLogging: { level: "info" },
        ...(isProd && isClient && { output: { module: false } }),
      }
    : {};

  // Establish test client overrides to ensure proper running
  const testClientExpandConfig =
    isTest && isClient
      ? {
          module: {
            parser: {
              javascript: {
                dynamicImportMode: "eager",
                dynamicImportPrefetch: true,
                dynamicImportPreload: true,
              },
            },
          },
          optimization: {
            splitChunks: false,
          },
          plugins: [new NodePolyfillPlugin()],
        }
      : {};

  // Second pass: re-run only when a mode override was detected, so the user config
  // can depend on fully-computed Meteor flags and helpers (swcConfigOptions, buildOutputDir, etc.).
  if (nextUserConfig?.mode || nextOverrideConfig?.mode || isAngularEnabled) {
    ({ nextUserConfig, nextOverrideConfig } = await loadUserAndOverrideConfig(
      projectConfigPath,
      Meteor,
      argv
    ));
  }
  let statsOverrided = false;
  let config = isClient ? clientConfig : serverConfig;
  if (nextUserConfig) {
    config = mergeSplitOverlap(config, nextUserConfig);
    if (nextUserConfig.stats != null) {
      statsOverrided = true;
    }
  }

  config = mergeSplitOverlap(config, angularExpandConfig);
  config = mergeSplitOverlap(config, testClientExpandConfig);

  if (nextOverrideConfig) {
    config = mergeSplitOverlap(config, nextOverrideConfig);
    if (nextOverrideConfig.stats != null) {
      statsOverrided = true;
    }
  }

  const shouldDisablePlugins = config?.disablePlugins != null;
  if (shouldDisablePlugins) {
    config = disablePlugins(config, config.disablePlugins);
    delete config.disablePlugins;
  }

  delete config["meteor.enablePortableBuild"];

  if (Meteor.isDebug || Meteor.isVerbose) {
  console.log("Config:", inspect(config, { depth: null, colors: true }));
  }

  // Check if lazyCompilation is enabled and warn the user
  if (
    config.lazyCompilation === true ||
    typeof config.lazyCompilation === "object"
  ) {
    console.warn(
      "\n⚠️  Warning: lazyCompilation may not work correctly in the current Meteor-Rspack integration.\n" +
        "   This feature will be evaluated for support in future Meteor versions.\n" +
        "   If you encounter any issues, please disable it in your rspack config.\n"
    );
  }

  // Add MeteorRspackOutputPlugin as the last plugin to output compilation info
  const meteorRspackOutputPlugin = new MeteorRspackOutputPlugin({
    getData: (stats, { isRebuild, compilationCount }) => ({
      name: config.name,
      mode: config.mode,
      hasErrors: stats.hasErrors(),
      hasWarnings: stats.hasWarnings(),
      timestamp: Date.now(),
      statsOverrided,
      compilationCount,
      isRebuild,
    }),
  });
  config.plugins = [meteorRspackOutputPlugin, ...(config.plugins || [])];

  return [config];
}
