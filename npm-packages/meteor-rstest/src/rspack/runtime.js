const fs = require('node:fs');
const path = require('node:path');

const INTERNAL_PLUGIN_NAMES = new Set([
  'RstestPlugin',
  'MeteorRstestMockRuntimePlugin',
]);

function appendMeteorModuleMockGuard(runtimeCode) {
  return `${runtimeCode}\n{
  const __meteorRstestGuardedOperations = [
    'rstest_mock',
    'rstest_mock_require',
    'rstest_do_mock',
    'rstest_do_mock_require',
    'rstest_unmock',
    'rstest_unmock_require',
    'rstest_do_unmock',
    'rstest_do_unmock_require',
    'rstest_require_actual',
    'rstest_import_actual',
    'rstest_dynamic_require',
  ];
  for (const __meteorRstestOperation of __meteorRstestGuardedOperations) {
    const __meteorRstestOriginal = __webpack_require__[__meteorRstestOperation];
    if (typeof __meteorRstestOriginal !== 'function') continue;
    __webpack_require__[__meteorRstestOperation] = function (...args) {
      const request = args.find(value =>
        typeof value === 'string' && /^meteor\\//.test(value)
      );
      if (request) {
        const error = new Error(
          '[Meteor Rstest] Cannot mock Meteor-owned module "' + request +
          '". Use dependency injection or spy on application-owned boundaries.'
        );
        error.code = 'METEOR_RSTEST_ATMOSPHERE_MOCK_UNSUPPORTED';
        throw error;
      }
      return __meteorRstestOriginal.apply(this, args);
    };
  }
}`;
}

class MeteorRstestMockRuntimePlugin {
  constructor(runtimeCodePath) {
    this.runtimeCodePath = runtimeCodePath;
  }

  apply(compiler) {
    const { RuntimeModule } = compiler.webpack;
    const runtimeCodePath = this.runtimeCodePath;

    class MeteorRstestRuntimeModule extends RuntimeModule {
      constructor() {
        super('meteor rstest runtime');
      }

      generate() {
        return appendMeteorModuleMockGuard(
          fs.readFileSync(runtimeCodePath, 'utf8'),
        );
      }
    }

    compiler.hooks.thisCompilation.tap(
      'MeteorRstestMockRuntimePlugin',
      compilation => {
        compilation.hooks.additionalTreeRuntimeRequirements.tap(
          'MeteorRstestMockRuntimePlugin',
          chunk => {
            compilation.addRuntimeModule(
              chunk,
              new MeteorRstestRuntimeModule(),
            );
          },
        );
      },
    );
  }
}

function resolveMockRuntimeCode({
  npmRoot,
  projectDir,
  resolveModule = require.resolve,
}) {
  const packageJson = resolveModule('@rstest/core/package.json', {
    paths: [npmRoot, projectDir].filter(Boolean),
  });
  return path.join(path.dirname(packageJson), 'dist', 'mockRuntimeCode.js');
}

function createMeteorRstestPlugins({
  upstreamRuntime,
  projectDir,
  npmRoot,
  runtimeCodePath,
  rspack,
  resolveModule,
}) {
  if (!upstreamRuntime) return [];
  const RstestPlugin = rspack?.experiments?.RstestPlugin;
  if (typeof RstestPlugin !== 'function') {
    throw new Error(
      '[Meteor Rstest] @rspack/core does not expose experiments.RstestPlugin.',
    );
  }
  const resolvedRuntimeCode = runtimeCodePath || resolveMockRuntimeCode({
    npmRoot,
    projectDir,
    resolveModule,
  });

  return [
    new RstestPlugin({
      injectModulePathName: true,
      importMetaPathName: true,
      hoistMockModule: true,
      manualMockRoot: path.resolve(projectDir, '__mocks__'),
    }),
    new MeteorRstestMockRuntimePlugin(resolvedRuntimeCode),
  ];
}

function enforceMeteorRstestPlugins(config, plugins) {
  if (!plugins.length) return config;
  config.plugins = (config.plugins || []).filter(plugin =>
    !INTERNAL_PLUGIN_NAMES.has(plugin?.constructor?.name)
  );
  config.plugins.push(...plugins);
  config.experiments ||= {};
  config.experiments.runtimeMode = 'webpack';
  return config;
}

module.exports = {
  appendMeteorModuleMockGuard,
  createMeteorRstestPlugins,
  enforceMeteorRstestPlugins,
  MeteorRstestMockRuntimePlugin,
};
