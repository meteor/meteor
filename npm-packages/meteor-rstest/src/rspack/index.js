const path = require("node:path");
const {
  applyRstestCoverageToSwcRule,
  getRstestCacheVersion,
  getRstestMeteorTestFlags,
  hasTypescriptRstestInputs,
  readRstestCoveragePlan,
  readRstestRuntimeInventory,
  readRstestRuntimeSettings,
  resolveRstestCoverageSwcPlugin,
} = require("./context.js");
const {
  createRstestRuntimeAlias,
  createRstestTestFileRegistration,
  enforceRstestRuntimeAlias,
  enforceRstestRuntimeOptimization,
} = require("./registration.js");
const { createMeteorRstestPlugins, enforceMeteorRstestPlugins } = require("./runtime.js");

// Loaded by the Meteor bundler only for a provider-selected build. Rspack is
// supplied by that build so plugins use the application's compiler instance.
module.exports = function createRstestRspackAdapter({
  options,
  projectDir,
  isClient,
  isTestLike,
  isTestFullApp,
  rspack,
}) {
  const runtime = options.runtime === true;
  const inventory =
    runtime && options.runtimeManifest
      ? readRstestRuntimeInventory({
          manifest: options.runtimeManifest,
          projectDir,
          client: isClient,
        })
      : {
          discoveryRoot: path.resolve(
            projectDir,
            `tests/rstest/runtime/${isClient ? "client" : "server"}`,
          ),
        };
  const runtimeSettings =
    runtime && options.runtimeSettingsPath
      ? readRstestRuntimeSettings(options.runtimeSettingsPath)
      : null;
  const setupFiles = runtimeSettings?.setupFiles || [];
  const runtimeAlias = createRstestRuntimeAlias({
    upstreamRuntime: runtime,
    projectDir,
    npmRoot: options.npmRoot,
  });
  const plugins = createMeteorRstestPlugins({
    upstreamRuntime: runtime,
    projectDir,
    npmRoot: options.npmRoot,
    rspack,
  });
  const coveragePlan = options.coveragePlanPath
    ? readRstestCoveragePlan(options.coveragePlanPath, {
        generation: options.coverageGeneration,
      })
    : null;
  const coveragePlugin = coveragePlan?.enabled
    ? resolveRstestCoverageSwcPlugin({ npmRoot: options.npmRoot })
    : null;

  return {
    runtime,
    meteorTestFlags: getRstestMeteorTestFlags({
      isTestLike,
      isTestFullApp,
      isRstestTest: runtime,
    }),
    ignoreEntries: [
      "**/tests/rstest/pure/**",
      "**/tests/rstest/browser/**",
      "**/tests/rstest/e2e/**",
      ...(runtime ? ["**/tests/legacy/**"] : []),
    ],
    entryOptions: runtime
      ? {
          discoveryRoot: inventory.discoveryRoot,
          testFileRoot: inventory.testFileRoot,
          includeFiles: inventory.files,
          setupFiles,
          testFileRegistration: createRstestTestFileRegistration({
            isRstestTest: true,
          }),
        }
      : {},
    cacheVersion: getRstestCacheVersion({
      testRunnerContext: options,
      runtimeSettings,
      inventory,
    }),
    typescript:
      runtime &&
      hasTypescriptRstestInputs({
        files: inventory.files,
        setupFiles,
      }),
    configureSwcRule(rule) {
      applyRstestCoverageToSwcRule(rule, {
        plan: coveragePlan,
        pluginPath: coveragePlugin,
      });
    },
    finalizeConfig(config) {
      enforceRstestRuntimeAlias(config, runtimeAlias);
      enforceRstestRuntimeOptimization(config, runtime);
      enforceMeteorRstestPlugins(config, plugins);
    },
  };
};
