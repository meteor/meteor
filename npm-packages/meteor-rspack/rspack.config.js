const { DefinePlugin, BannerPlugin, NormalModuleReplacementPlugin } = require('@rspack/core');
const fs = require('fs');
const { inspect } = require('node:util');
const path = require('path');
const { merge } = require('webpack-merge');

const { cleanOmittedPaths, mergeSplitOverlap } = require("./lib/mergeRulesSplitOverlap.js");
const { getMeteorAppSwcConfig } = require('./lib/swc.js');
const HtmlRspackPlugin = require('./plugins/HtmlRspackPlugin.js');
const { RequireExternalsPlugin } = require('./plugins/RequireExtenalsPlugin.js');
const { generateEagerTestFile } = require("./lib/test.js");
const { getMeteorIgnoreEntries, createIgnoreGlobConfig } = require("./lib/ignore");
const { mergeMeteorRspackFragments } = require("./lib/meteorRspackConfigFactory.js");
const {
  compileWithMeteor,
  compileWithRspack,
  setCache,
  makeWebNodeBuiltinsAlias,
} = require('./lib/meteorRspackHelpers.js');

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
function createCacheStrategy(mode, side, { projectConfigPath, configPath } = {}) {
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
          directory: `node_modules/.cache/rspack${(side && `/${side}`) || ""}`,
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
}) {
  const defaultConfig = {
    jsc: {
      baseUrl: process.cwd(),
      paths: { '/*': ['*', '/*'] },
      parser: {
        syntax: isTypescriptEnabled ? 'typescript' : 'ecmascript',
        ...(isTsxEnabled && { tsx: true }),
        ...(isJsxEnabled && { jsx: true }),
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
    loader: 'builtin:swc-loader',
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
    if (Meteor[key] === 'true' || Meteor[key] === true) {
      Meteor[key] = true;
    } else if (Meteor[key] === 'false' || Meteor[key] === false) {
      Meteor[key] = false;
    }
  }

  const isProd = !!Meteor.isProduction || argv.mode === 'production';
  const isDev = !!Meteor.isDevelopment || !isProd;
  const isTest = !!Meteor.isTest;
  const isClient = !!Meteor.isClient;
  const isServer = !!Meteor.isServer;
  const isRun = !!Meteor.isRun;
  const isBuild = !!Meteor.isBuild;
  const isReactEnabled = !!Meteor.isReactEnabled;
  const isTestModule = !!Meteor.isTestModule;
  const isTestEager = !!Meteor.isTestEager;
  const isTestFullApp = !!Meteor.isTestFullApp;
  const swcExternalHelpers = !!Meteor.swcExternalHelpers;
  const isNative = !!Meteor.isNative;
  const mode = isProd ? 'production' : 'development';
  const projectDir = process.cwd();
  const projectConfigPath = Meteor.projectConfigPath || path.resolve(projectDir, 'rspack.config.js');
  const configPath = Meteor.configPath;

  const isTypescriptEnabled = Meteor.isTypescriptEnabled || false;
  const isJsxEnabled =
    Meteor.isJsxEnabled || (!isTypescriptEnabled && isReactEnabled) || false;
  const isTsxEnabled =
    Meteor.isTsxEnabled || (isTypescriptEnabled && isReactEnabled) || false;
  const isBundleVisualizerEnabled = Meteor.isBundleVisualizerEnabled || false;

  // Determine entry points
  const entryPath = Meteor.entryPath;

  // Determine output points
  const outputPath = Meteor.outputPath;
  const outputDir = path.dirname(Meteor.outputPath || '');

  const outputFilename = Meteor.outputFilename;

  // Determine run point
  const runPath = Meteor.runPath;

  // Determine banner
  const bannerOutput = JSON.parse(Meteor.bannerOutput || process.env.RSPACK_BANNER || '""');

  // Determine output directories
  const clientOutputDir = path.resolve(projectDir, 'public');
  const serverOutputDir = path.resolve(projectDir, 'private');

  // Determine context for bundles and assets
  const buildContext = Meteor.buildContext || '_build';
  const assetsContext = Meteor.assetsContext || 'build-assets';
  const chunksContext = Meteor.chunksContext || 'build-chunks';

  // Determine build output and pass to Meteor
  const buildOutputDir = path.resolve(projectDir, buildContext, outputDir);
  Meteor.buildOutputDir = buildOutputDir;

  const cacheStrategy = createCacheStrategy(
    mode,
    (Meteor.isClient && 'client') || 'server',
    { projectConfigPath, configPath }
  );

  // Expose Meteor's helpers to expand Rspack configs
  Meteor.compileWithMeteor = deps => compileWithMeteor(deps);
  Meteor.compileWithRspack = deps =>
    compileWithRspack(deps, {
      options: Meteor.swcConfigOptions,
    });
  Meteor.setCache = enabled =>
    setCache(
      !!enabled,
      enabled === 'memory' ? undefined : cacheStrategy
    );

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
      ...createIgnoreGlobConfig([
        ...meteorIgnoreEntries,
        ...additionalEntries,
      ]),
    ],
  };

  if (Meteor.isDebug || Meteor.isVerbose) {
    console.log('[i] Rspack mode:', mode);
    console.log('[i] Meteor flags:', Meteor);
  }

  const enableSwcExternalHelpers = !isServer && swcExternalHelpers;
  const isDevEnvironment = isRun && isDev && !isTest && !isNative;
  const swcConfigRule = createSwcConfig({
    isTypescriptEnabled,
    isReactEnabled,
    isJsxEnabled,
    isTsxEnabled,
    externalHelpers: enableSwcExternalHelpers,
    isDevEnvironment,
    isClient,
  });
  // Expose swc config to use in custom configs
  Meteor.swcConfigOptions = swcConfigRule.options;

  const externals = [
    /^meteor.*/,
    ...(isReactEnabled ? [/^react$/, /^react-dom$/] : []),
    ...(isServer ? [/^bcrypt$/] : []),
  ];
  const alias = {
    '/': path.resolve(process.cwd()),
  };
  const fallback = {
    ...(isClient && makeWebNodeBuiltinsAlias()),
  };
  const extensions = [
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.wasm',
  ];
  const extraRules = [];

  const reactRefreshModule = isReactEnabled
    ? safeRequire('@rspack/plugin-react-refresh')
    : null;

  const requireExternalsPlugin = new RequireExternalsPlugin({
    filePath: path.join(buildContext, runPath),
    ...(Meteor.isBlazeEnabled && {
      externals: /\.html$/,
      isEagerImport: module => module.endsWith('.html'),
      ...(isProd && {
        lastImports: [`./${outputFilename}`],
      }),
    }),
    enableGlobalPolyfill: isDevEnvironment && !isServer,
  });

  const rsdoctorModule = isBundleVisualizerEnabled
    ? safeRequire('@rsdoctor/rspack-plugin')
    : null;
  const doctorPluginConfig = isRun && isBundleVisualizerEnabled && rsdoctorModule?.RsdoctorRspackPlugin
    ? [
        new rsdoctorModule.RsdoctorRspackPlugin({
          port: isClient
            ? (parseInt(Meteor.rsdoctorClientPort || '8888', 10))
            : (parseInt(Meteor.rsdoctorServerPort || '8889', 10)),
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

  const clientNameConfig = `[${(isTest && 'test-') || ''}${
    (isTestModule && 'module') || 'client'
  }-rspack]`;
  // Base client config
  let clientConfig = {
    name: clientNameConfig,
    target: 'web',
    mode,
    entry: path.resolve(process.cwd(), buildContext, entryPath),
    output: {
      path: clientOutputDir,
      filename: (_module) => {
        const chunkName = _module.chunk?.name;
        const isMainChunk = !chunkName || chunkName === "main";
        const chunkSuffix = `${chunksContext}/[id]${
          isProd ? '.[chunkhash]' : ''
        }.js`;
        if (isDevEnvironment) {
          if (isMainChunk) return outputFilename;
          return chunkSuffix;
        }
        if (isMainChunk) return `../${buildContext}/${outputPath}`;
        return chunkSuffix;
      },
      libraryTarget: 'commonjs2',
      publicPath: '/',
      chunkFilename: `${chunksContext}/[id]${isProd ? '.[chunkhash]' : ''}.js`,
      assetModuleFilename: `${assetsContext}/[hash][ext][query]`,
      cssFilename: `${chunksContext}/[name]${
        isProd ? '.[contenthash]' : ''
      }.css`,
      cssChunkFilename: `${chunksContext}/[id]${
        isProd ? '.[contenthash]' : ''
      }.css`,
      ...(isProd && { clean: { keep: keepOutsideBuild() } }),
    },
    optimization: {
      usedExports: true,
      splitChunks: { chunks: 'async' },
    },
    module: {
      rules: [
        swcConfigRule,
        ...(Meteor.isBlazeEnabled
          ? [
              {
                test: /\.html$/i,
                loader: 'ignore-loader',
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
      ].filter(Boolean),
      new DefinePlugin({
        'Meteor.isClient': JSON.stringify(true),
        'Meteor.isServer': JSON.stringify(false),
        'Meteor.isTest': JSON.stringify(isTest && !isTestFullApp),
        'Meteor.isAppTest': JSON.stringify(isTest && isTestFullApp),
        'Meteor.isDevelopment': JSON.stringify(isDev),
        'Meteor.isProduction': JSON.stringify(isProd),
      }),
      ...bannerPluginConfig,
      Meteor.HtmlRspackPlugin(),
      ...doctorPluginConfig,
      new NormalModuleReplacementPlugin(/^node:(.*)$/, (res) => {
        res.request = res.request.replace(/^node:/, '');
      }),
    ],
    watchOptions,
    devtool: isDevEnvironment || isNative || isTest ? 'source-map' : 'hidden-source-map',
    ...(isDevEnvironment && {
      devServer: {
        ...createRemoteDevServerConfig(),
        static: { directory: clientOutputDir, publicPath: '/__rspack__/' },
        hot: true,
        liveReload: true,
        ...(Meteor.isBlazeEnabled && { hot: false }),
        port: Meteor.devServerPort || 8080,
        devMiddleware: {
          writeToDisk: filePath =>
            /\.(html)$/.test(filePath) && !filePath.includes('.hot-update.'),
        },
      },
    }),
    ...merge(cacheStrategy, { experiments: { css: true } })
  };


  const serverEntry =
    isTest && isTestEager && isTestFullApp
      ? generateEagerTestFile({
          isAppTest: true,
          projectDir,
          buildContext,
          entries: meteorIgnoreEntries,
        })
      : isTest && isTestEager
      ? generateEagerTestFile({
          isAppTest: false,
          projectDir,
          buildContext,
          entries: meteorIgnoreEntries,
        })
      : path.resolve(projectDir, buildContext, entryPath);
  const serverNameConfig = `[${(isTest && 'test-') || ''}${
    (isTestModule && 'module') || 'server'
  }-rspack]`;
  // Base server config
  let serverConfig = {
    name: serverNameConfig,
    target: 'node',
    mode,
    entry: serverEntry,
    output: {
      path: serverOutputDir,
      filename: () => `../${buildContext}/${outputPath}`,
      libraryTarget: 'commonjs2',
      chunkFilename: `${chunksContext}/[id]${isProd ? '.[chunkhash]' : ''}.js`,
      assetModuleFilename: `${assetsContext}/[hash][ext][query]`,
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
          dynamicImportMode: 'eager',
        },
      },
    },
    resolve: {
      extensions,
      alias,
      modules: ['node_modules', path.resolve(projectDir)],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    externals,
    externalsPresets: { node: true },
    plugins: [
      new DefinePlugin(
        isTest && (isTestModule || isTestEager)
          ? {
              'Meteor.isTest': JSON.stringify(isTest && !isTestFullApp),
              'Meteor.isAppTest': JSON.stringify(isTest && isTestFullApp),
              'Meteor.isDevelopment': JSON.stringify(isDev),
            }
          : {
              'Meteor.isClient': JSON.stringify(false),
              'Meteor.isServer': JSON.stringify(true),
              'Meteor.isTest': JSON.stringify(isTest && !isTestFullApp),
              'Meteor.isAppTest': JSON.stringify(isTest && isTestFullApp),
              'Meteor.isDevelopment': JSON.stringify(isDev),
              'Meteor.isProduction': JSON.stringify(isProd),
            },
      ),
      ...bannerPluginConfig,
      requireExternalsPlugin,
      ...doctorPluginConfig,
    ],
    watchOptions,
    devtool: isDevEnvironment || isNative || isTest ? 'source-map' : 'hidden-source-map',
    ...((isDevEnvironment || (isTest && !isTestEager) || isNative) &&
      cacheStrategy),
  };

  // Load and apply project-level overrides for the selected build
  // Check if we're in a Meteor package directory by looking at the path
  const isMeteorPackageConfig = projectDir.includes('/packages/rspack');
  if (fs.existsSync(projectConfigPath) && !isMeteorPackageConfig) {
    // Check if there's a .mjs or .cjs version of the config file
    const mjsConfigPath = projectConfigPath.replace(/\.js$/, '.mjs');
    const cjsConfigPath = projectConfigPath.replace(/\.js$/, '.cjs');

    let configPath = projectConfigPath;
    if (fs.existsSync(mjsConfigPath)) {
      configPath = mjsConfigPath;
    } else if (fs.existsSync(cjsConfigPath)) {
      configPath = cjsConfigPath;
    }

    // Use require for CommonJS modules and dynamic import for ES modules
    let projectConfig;
    try {
      if (path.extname(configPath) === '.mjs') {
        // For ESM modules, we need to use dynamic import
        const fileUrl = `file://${configPath}`;
        const module = await import(fileUrl);
        projectConfig = module.default || module;
      } else {
        // For CommonJS modules, we can use require
        projectConfig = require(configPath)?.default || require(configPath);
      }
    } catch (error) {
      console.error(`Error loading rspack config from ${configPath}:`, error);
      throw error;
    }

    const userConfig =
      typeof projectConfig === 'function'
        ? projectConfig(Meteor, argv)
        : projectConfig;

    const omitPaths = [
      "name",
      "target",
      "entry",
      "output.path",
      "output.filename",
      "output.publicPath",
      ...(Meteor.isServer
        ? ["optimization.splitChunks", "optimization.runtimeChunk"]
        : []),
    ].filter(Boolean);
    const warningFn = path => {
      console.warn(
        `[rspack.config.js] Ignored custom "${path}" — reserved for Meteor-Rspack integration.`,
      );
    };

    let nextUserConfig = cleanOmittedPaths(userConfig, {
      omitPaths,
      warningFn,
    });
    nextUserConfig = mergeMeteorRspackFragments(nextUserConfig);

    if (Meteor.isClient) {
      clientConfig = mergeSplitOverlap(
        clientConfig,
        nextUserConfig
      );
    }
    if (Meteor.isServer) {
      serverConfig = mergeSplitOverlap(
        serverConfig,
        nextUserConfig
      );
    }
  }

  const config = isClient ? clientConfig : serverConfig;

  if (Meteor.isDebug || Meteor.isVerbose) {
    console.log('Config:', inspect(config, { depth: null, colors: true }));
  }

  return [config];
}
