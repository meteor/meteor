const path = require('node:path');
const { DefinePlugin } = require('@rspack/core');
const { merge } = require('rspack-merge');
const { cleanOmittedPaths, mergeSplitOverlap } = require('./lib/mergeRulesSplitOverlap.js');
const { makeWebNodeBuiltinsAlias } = require('./lib/meteorRspackHelpers.js');
const { getMeteorAppSwcConfig } = require('./lib/swc.js');

const TEST_EXTENSIONS = [
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.wasm',
];

function createMeteorSwcRule({
  root = process.cwd(),
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
      baseUrl: root,
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
  const cleanedCustomConfig = cleanOmittedPaths(
    getMeteorAppSwcConfig(root) || {},
    {
      omitPaths: ['jsc.target'],
      warningFn: configPath => console.warn(
        `[.swcrc] Ignored custom "${configPath}" — reserved for Meteor-Rspack integration.`,
      ),
    },
  );
  return {
    test: /\.(?:[mc]?js|jsx|[mc]?ts|tsx)$/i,
    exclude: /node_modules|\.meteor[\\/]local/,
    loader: 'builtin:swc-loader',
    options: merge(defaultConfig, cleanedCustomConfig),
  };
}

/**
 * Test-safe projection of Meteor's Rspack language configuration.
 *
 * This deliberately excludes Meteor application lifecycle plugins, generated
 * entries, externals, dev-server configuration, and output ownership. Rstest
 * supplies those pieces. Meteor-backed projects keep using rspack.config.js.
 */
function createTestRspackConfig({
  root = process.cwd(),
  target = 'node',
  typescript = false,
  jsx = false,
  decorators = false,
  swc = {},
  aliases = {},
  resolve = {},
  allowedMeteorRequests = [],
} = {}) {
  const isTypescript = Boolean(typescript);
  const isJsx = Boolean(jsx);
  const swcRule = createMeteorSwcRule({
    root: path.resolve(root),
    isTypescriptEnabled: isTypescript,
    isReactEnabled: isJsx,
    isJsxEnabled: !isTypescript && isJsx,
    isTsxEnabled: isTypescript && isJsx,
    externalHelpers: false,
    isDevEnvironment: true,
    isClient: target !== 'node',
    isAngularEnabled: decorators,
  });
  swcRule.options = mergeSplitOverlap(swcRule.options, swc, { sourceMaps: true });
  const allowedMeteor = new Set(allowedMeteorRequests);
  const rejectMeteorRuntime = ({ request, contextInfo }, callback) => {
    if (/^meteor\//.test(request || '') && !allowedMeteor.has(request)) {
      const error = new Error(
        `[Meteor Rstest] ${request} requires Meteor runtime` +
        `${contextInfo && contextInfo.issuer ? ` (imported by ${contextInfo.issuer})` : ''}. ` +
        'Move this test to tests/rstest/runtime/server or runtime/client, or configure an explicit alias/mock.'
      );
      error.code = 'RSTEST_RUNTIME_PROJECT_REQUIRED';
      callback(error);
      return;
    }
    callback();
  };

  const defaultResolve = {
    extensions: TEST_EXTENSIONS,
    roots: [path.resolve(root)],
    modules: ['node_modules', path.resolve(root)],
    conditionNames: target === 'node'
      ? ['import', 'require', 'node', 'default']
      : ['browser', 'import', 'default'],
    fallback: target === 'node' ? {} : makeWebNodeBuiltinsAlias(),
  };
  const projectedResolve = {
    ...defaultResolve,
    ...resolve,
    alias: { ...resolve.alias, ...aliases },
    fallback: { ...defaultResolve.fallback, ...resolve.fallback },
  };

  return {
    name: target === 'node' ? 'meteor-test-server' : 'meteor-test-client',
    context: path.resolve(root),
    target,
    mode: 'development',
    devtool: 'source-map',
    cache: false,
    module: {
      rules: [
        swcRule,
        { test: /\.css$/i, type: 'css/auto' },
        {
          test: /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?|ttf|eot)$/i,
          type: 'asset/resource',
        },
      ],
      parser: {
        javascript: {
          dynamicImportMode: 'eager',
          exportsPresence: 'warn',
        },
      },
    },
    resolve: projectedResolve,
    externals: [rejectMeteorRuntime],
    plugins: [new DefinePlugin({
      'Meteor.isClient': JSON.stringify(target !== 'node'),
      'Meteor.isServer': JSON.stringify(target === 'node'),
      'Meteor.isTest': JSON.stringify(true),
      'Meteor.isAppTest': JSON.stringify(false),
      'Meteor.isDevelopment': JSON.stringify(true),
      'Meteor.isProduction': JSON.stringify(false),
    })],
    ...(target === 'node' ? { externalsPresets: { node: true } } : {}),
  };
}

module.exports = { createMeteorSwcRule, createTestRspackConfig, TEST_EXTENSIONS };
