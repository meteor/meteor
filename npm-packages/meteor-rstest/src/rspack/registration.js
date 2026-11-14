const createRstestTestFileRegistration = ({ isRstestTest }) => {
  if (!isRstestTest) return undefined;
  return {
    module: "meteor/rstest",
    exportName: "__registerTestFileLoader",
    mode: "sync",
    runtimeFactory: {
      module: "@meteorjs/rstest/runtime",
      exportName: "createMeteorRstestFileRuntime",
      registrationExportName: "__setRstestRuntimeFactory",
    },
  };
};

const createRstestRuntimeAlias = ({
  upstreamRuntime,
  projectDir,
  npmRoot,
  resolveModule = require.resolve,
}) => {
  if (!upstreamRuntime) return undefined;
  const searchPaths = [npmRoot, projectDir].filter(Boolean);
  const runtimePath = resolveModule("@rstest/core/internal/browser-runtime", {
    paths: searchPaths,
  });
  const meteorRuntimePath = resolveModule("@meteorjs/rstest/runtime", { paths: searchPaths });
  return {
    "@rstest/core$": runtimePath,
    "@meteorjs/rstest/runtime$": meteorRuntimePath,
  };
};

const enforceRstestRuntimeAlias = (config, alias) => {
  if (!alias) return config;
  config.resolve ||= {};
  config.resolve.alias = {
    ...config.resolve.alias,
    ...alias,
  };
  return config;
};

const enforceRstestRuntimeOptimization = (config, upstreamRuntime) => {
  if (!upstreamRuntime) return config;
  // Meteor test hosts expose development variants of shared npm modules.
  // Keep embedded Rstest modules on same condition set; mixing production
  // react-dom with host-owned development React breaks shared internals.
  config.mode = "development";
  config.optimization ||= {};
  config.optimization.usedExports = false;
  config.optimization.minimize = false;
  // Rstest hoists module mocks ahead of imports inside each test module.
  // Scope hoisting would move bundled imports above that transformed call.
  config.optimization.concatenateModules = false;
  return config;
};

module.exports = {
  createRstestRuntimeAlias,
  createRstestTestFileRegistration,
  enforceRstestRuntimeAlias,
  enforceRstestRuntimeOptimization,
};
