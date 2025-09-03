import { DefinePlugin, BannerPlugin } from '@rspack/core';
import fs from 'fs';
import { createRequire } from 'module';
import { inspect } from 'node:util';
import path from 'path';
import { merge } from 'webpack-merge';

import { cleanOmittedPaths, mergeSplitOverlap } from "./lib/mergeRulesSplitOverlap.js";
import { getMeteorAppSwcConfig } from './lib/swc.js';
import HtmlRspackPlugin from './plugins/HtmlRspackPlugin.js';
import { RequireExternalsPlugin } from './plugins/RequireExtenalsPlugin.js';

const require = createRequire(import.meta.url);

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
function createCacheStrategy(mode) {
  return {
    cache: true,
    experiments: {
      cache: {
        version: `swc-${mode}`,
        type: 'persistent',
        storage: {
          type: 'filesystem',
          directory: 'node_modules/.cache/rspack',
        },
      },
    },
  };
}

// SWC loader rule (JSX/JS)
function createSwcConfig({
  isTypescriptEnabled,
  isJsxEnabled,
  isTsxEnabled,
  externalHelpers,
  isDevEnvironment,
}) {
  const defaultConfig = {
    jsc: {
      baseUrl: process.cwd(),
      paths: { '/*': ['*'] },
      parser: {
        syntax: isTypescriptEnabled ? 'typescript' : 'ecmascript',
        ...(isTsxEnabled && { tsx: true }),
        ...(isJsxEnabled && { jsx: true }),
      },
      target: 'es2015',
      transform: {
        react: {
          development: isDevEnvironment,
          refresh: isDevEnvironment,
        },
      },
      externalHelpers,
    },
  };
  const customConfig = getMeteorAppSwcConfig() || {};
  const swcConfig = merge(defaultConfig, customConfig);
  return {
    test: /\.(?:[mc]?js|jsx|[mc]?ts|tsx)$/i,
    exclude: /node_modules|\.meteor\/local/,
    loader: 'builtin:swc-loader',
    options: swcConfig,
  };
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

// Watch options shared across both builds
const defaultWatchOptions = {
  ignored: ['**/.meteor/local/**', '**/dist/**'],
};

/**
 * @param {{ isClient: boolean; isServer: boolean; isDevelopment?: boolean; isProduction?: boolean; isTest?: boolean }} Meteor
 * @param {{ mode?: string; clientEntry?: string; serverEntry?: string; clientOutputFolder?: string; serverOutputFolder?: string; chunksContext?: string; assetsContext?: string; serverAssetsContext?: string }} argv
 * @returns {import('@rspack/cli').Configuration[]}
 */
export default function (inMeteor = {}, argv = {}) {
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
  const isRun = !!Meteor.isRun;
  const isReactEnabled = !!Meteor.isReactEnabled;
  const isTestModule = !!Meteor.isTestModule;
  const isTestEager = !!Meteor.isTestEager;
  const isTestFullApp = !!Meteor.isTestFullApp;
  const swcExternalHelpers = !!Meteor.swcExternalHelpers;
  const isNative = !!Meteor.isNative;
  const mode = isProd ? 'production' : 'development';

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
  const bannerOutput = JSON.parse(Meteor.bannerOutput || '');

  // Determine output directories
  const clientOutputDir = path.resolve(process.cwd(), 'public');
  const serverOutputDir = path.resolve(process.cwd(), 'private');

  // Determine context for bundles and assets
  const buildContext = Meteor.buildContext || '_build';
  const assetsContext = Meteor.assetsContext || 'build-assets';
  const chunksContext = Meteor.chunksContext || 'build-chunks';

  // Determine build output and pass to Meteor
  const buildOutputDir = path.resolve(process.cwd(), buildContext, outputDir);
  Meteor.buildOutputDir = buildOutputDir;

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

  // Set watch options
  const watchOptions = {
    ...defaultWatchOptions,
    ...(isTest &&
      isTestEager && {
        ignored: [
          ...defaultWatchOptions.ignored,
          '**/_build/**',
          '**/.meteor/local/**',
          '**/node_modules/**',
        ],
      }),
  };

  if (Meteor.isDebug || Meteor.isVerbose) {
    console.log('[i] Rspack mode:', mode);
    console.log('[i] Meteor flags:', Meteor);
  }

  const isDevEnvironment = isRun && isDev && !isTest && !isNative;
  const swcConfigRule = createSwcConfig({
    isTypescriptEnabled,
    isJsxEnabled,
    isTsxEnabled,
    externalHelpers: swcExternalHelpers,
    isDevEnvironment,
  });
  // Expose swc config to use in custom configs
  Meteor.swcConfigOptions = swcConfigRule.options;

  const externals = [
    /^meteor.*/,
    ...(isReactEnabled ? [/^react$/, /^react-dom$/] : []),
  ];
  const alias = {
    '/': path.resolve(process.cwd()),
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
    enableGlobalPolyfill: isDevEnvironment,
  });

  const rsdoctorModule = isBundleVisualizerEnabled
    ? safeRequire('@rsdoctor/rspack-plugin')
    : null;
  const doctorPluginConfig = isBundleVisualizerEnabled && rsdoctorModule?.RsdoctorRspackPlugin
    ? [
        new rsdoctorModule.RsdoctorRspackPlugin({
          port: isClient ? 8081 : 8082,
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
    mode: 'development',
    entry: path.resolve(process.cwd(), buildContext, entryPath),
    output: {
      path: clientOutputDir,
      filename: () =>
        isDevEnvironment ? outputFilename : `../${buildContext}/${outputPath}`,
      libraryTarget: 'commonjs',
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
    resolve: { extensions, alias },
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
      new BannerPlugin({
        banner: bannerOutput,
        entryOnly: true,
      }),
      Meteor.HtmlRspackPlugin(),
      ...doctorPluginConfig,
    ],
    watchOptions,
    devtool: isDevEnvironment || isNative || isTest ? 'source-map' : 'hidden-source-map',
    ...(isDevEnvironment && {
      devServer: {
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
    experiments: { css: true },
  };

  const serverEntry =
    isTest && isTestEager && isTestFullApp
      ? path.resolve(process.cwd(), 'node_modules/@meteorjs/rspack/entries/eager-app-tests.js')
      : isTest && isTestEager
      ? path.resolve(process.cwd(), 'node_modules/@meteorjs/rspack/entries/eager-tests.js')
      : path.resolve(process.cwd(), buildContext, entryPath);
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
      libraryTarget: 'commonjs',
      chunkFilename: `${chunksContext}/[id]${isProd ? '.[chunkhash]' : ''}.js`,
      assetModuleFilename: `${assetsContext}/[hash][ext][query]`,
      ...(isProd && { clean: { keep: keepOutsideBuild() } }),
    },
    optimization: { usedExports: true },
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
      modules: ['node_modules', path.resolve(process.cwd())],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    externals,
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
      new BannerPlugin({
        banner: bannerOutput,
        entryOnly: true,
      }),
      isTestModule && requireExternalsPlugin,
      ...doctorPluginConfig,
    ],
    watchOptions,
    devtool: isDevEnvironment || isNative || isTest ? 'source-map' : 'hidden-source-map',
    ...((isDevEnvironment || (isTest && !isTestEager) || isNative) &&
      createCacheStrategy(mode)),
  };

  // Load and apply project-level overrides for the selected build
  const projectConfigPath = path.resolve(process.cwd(), 'rspack.config.js');

  // Check if we're in a Meteor package directory by looking at the path
  const isMeteorPackageConfig = process.cwd().includes('/packages/rspack');
  if (fs.existsSync(projectConfigPath) && !isMeteorPackageConfig) {
    const projectConfig =
      require(projectConfigPath)?.default || require(projectConfigPath);

    const userConfig =
      typeof projectConfig === 'function'
        ? projectConfig(Meteor, argv)
        : projectConfig;

    const omitPaths = [
      'name',
      'target',
      'entry',
      'output.path',
      'output.filename',
      'output.publicPath',
    ];
    const warningFn = path => {
      console.warn(
        `[rspack.config.js] Ignored custom "${path}" — reserved for Meteor-Rspack integration.`,
      );
    };

    if (Meteor.isClient) {
      clientConfig = mergeSplitOverlap(
        clientConfig,
        cleanOmittedPaths(userConfig, { omitPaths, warningFn }),
      );
    }
    if (Meteor.isServer) {
      serverConfig = mergeSplitOverlap(
        serverConfig,
        cleanOmittedPaths(userConfig, { omitPaths, warningFn }),
      );
    }
  }

  const config = isClient ? clientConfig : serverConfig;

  if (Meteor.isDebug || Meteor.isVerbose) {
    console.log('Config:', inspect(config, { depth: null, colors: true }));
  }

  return [config];
}
