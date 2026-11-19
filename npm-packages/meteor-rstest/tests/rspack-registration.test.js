const assert = require("node:assert/strict");
const test = require("node:test");

const {
  appendMeteorModuleMockGuard,
  createMeteorRstestPlugins,
  enforceMeteorRstestPlugins,
} = require("../src/rspack/runtime.js");
const {
  createRstestRuntimeAlias,
  createRstestTestFileRegistration,
  enforceRstestRuntimeAlias,
  enforceRstestRuntimeOptimization,
} = require("../src/rspack/registration.js");

test("unified Rstest runtime selects deferred loader registration only for Rstest builds", () => {
  assert.deepEqual(
    createRstestTestFileRegistration({
      isRstestTest: true,
    }),
    {
      module: "meteor/rstest",
      exportName: "__registerTestFileLoader",
      mode: "sync",
      runtimeFactory: {
        module: "@meteorjs/rstest/runtime",
        exportName: "createMeteorRstestFileRuntime",
        registrationExportName: "__setRstestRuntimeFactory",
      },
    },
  );
  assert.equal(
    createRstestTestFileRegistration({
      isRstestTest: false,
    }),
    undefined,
  );
});

test("Rstest upstream runtime alias resolves from harness and overrides user alias", () => {
  const resolutions = [];
  const alias = createRstestRuntimeAlias({
    upstreamRuntime: true,
    projectDir: "/meteor-app",
    npmRoot: "/meteor-harness",
    resolveModule(request, options) {
      resolutions.push({ request, options });
      return request === "@meteorjs/rstest/runtime"
        ? "/meteor-harness/node_modules/@meteorjs/rstest/src/runtime/index.js"
        : "/meteor-harness/node_modules/@rstest/core/dist/browser-runtime/index.js";
    },
  });

  assert.deepEqual(resolutions, [
    {
      request: "@rstest/core/internal/browser-runtime",
      options: { paths: ["/meteor-harness", "/meteor-app"] },
    },
    {
      request: "@meteorjs/rstest/runtime",
      options: { paths: ["/meteor-harness", "/meteor-app"] },
    },
  ]);
  assert.deepEqual(alias, {
    "@rstest/core$": "/meteor-harness/node_modules/@rstest/core/dist/browser-runtime/index.js",
    "@meteorjs/rstest/runtime$":
      "/meteor-harness/node_modules/@meteorjs/rstest/src/runtime/index.js",
  });

  const config = { resolve: { alias: { "@rstest/core$": "/user/wrong.js" } } };
  enforceRstestRuntimeAlias(config, alias);
  assert.deepEqual(config.resolve.alias, alias);
  assert.equal(createRstestRuntimeAlias({ upstreamRuntime: false }), undefined);

  const optimized = {
    optimization: { usedExports: true, minimize: true, sideEffects: true },
  };
  enforceRstestRuntimeOptimization(optimized, true);
  assert.deepEqual(optimized.optimization, {
    usedExports: false,
    minimize: false,
    concatenateModules: false,
    sideEffects: true,
  });
  assert.equal(optimized.mode, "development");
});

test("Meteor Rstest compiler plugins preserve upstream transforms after user config", () => {
  class RstestPlugin {
    constructor(options) {
      this.options = options;
    }
  }
  const plugins = createMeteorRstestPlugins({
    upstreamRuntime: true,
    projectDir: "/meteor-app",
    runtimeCodePath: "/rstest/mockRuntimeCode.js",
    rspack: { experiments: { RstestPlugin } },
  });

  assert.equal(plugins.length, 2);
  assert.deepEqual(plugins[0].options, {
    injectModulePathName: true,
    importMetaPathName: true,
    hoistMockModule: true,
    manualMockRoot: "/meteor-app/__mocks__",
  });
  assert.equal(plugins[1].runtimeCodePath, "/rstest/mockRuntimeCode.js");

  const config = { plugins: [{ constructor: { name: "UserPlugin" } }] };
  enforceMeteorRstestPlugins(config, plugins);
  enforceMeteorRstestPlugins(config, plugins);
  assert.deepEqual(config.plugins, [{ constructor: { name: "UserPlugin" } }, ...plugins]);
  assert.deepEqual(createMeteorRstestPlugins({ upstreamRuntime: false }), []);
});

test("Meteor Rstest mock runtime blocks Meteor-owned module replacement", () => {
  const runtime = appendMeteorModuleMockGuard("UPSTREAM_RUNTIME");

  assert.match(runtime, /UPSTREAM_RUNTIME/);
  assert.match(runtime, /METEOR_RSTEST_ATMOSPHERE_MOCK_UNSUPPORTED/);
  assert.match(runtime, /meteor\\\//);
  assert.match(runtime, /rstest_mock/);
  assert.match(runtime, /rstest_import_actual/);
});
