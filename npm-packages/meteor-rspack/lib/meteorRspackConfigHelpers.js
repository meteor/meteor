const path = require('path');
const fs = require('fs');
const { cleanOmittedPaths } = require("./mergeRulesSplitOverlap.js");
const { mergeMeteorRspackFragments } = require("./meteorRspackConfigFactory.js");

// Helper function to load and process config files
async function loadAndProcessConfig(configPath, configType, Meteor, argv, disableWarnings) {
  try {
    // Load the config file
    let config;
    if (path.extname(configPath) === '.mjs') {
      // For ESM modules, we need to use dynamic import
      const fileUrl = `file://${configPath}`;
      const module = await import(fileUrl);
      config = module.default || module;
    } else {
      // For CommonJS modules, we can use require
      config = require(configPath)?.default || require(configPath);
    }

    // Process the config
    const rawConfig = typeof config === 'function' ? config(Meteor, argv) : config;
    const resolvedConfig = await Promise.resolve(rawConfig);
    const userConfig = resolvedConfig && '0' in resolvedConfig ? resolvedConfig[0] : resolvedConfig;

    // Define omitted paths and warning function
    const omitPaths = [
      "name",
      "target",
      "entry",
      "output.path",
      "output.filename",
      ...(Meteor.isServer ? ["optimization.splitChunks", "optimization.runtimeChunk"] : []),
    ].filter(Boolean);

    const warningFn = path => {
      if (disableWarnings) return;
      console.warn(
        `[${configType}] Ignored custom "${path}" — reserved for Meteor-Rspack integration.`,
      );
    };

    // Clean omitted paths and merge Meteor Rspack fragments
    let nextConfig = cleanOmittedPaths(userConfig, {
      omitPaths,
      warningFn,
    });
    nextConfig = mergeMeteorRspackFragments(nextConfig);

    return nextConfig;
  } catch (error) {
    console.error(`Error loading ${configType} from ${configPath}:`, error);
    if (configType === 'rspack.config.js') {
      throw error; // Only rethrow for project config
    }
    return null;
  }
}

/**
 * Loads both the user's Rspack configuration and its potential override.
 *
 * @param {string|undefined} projectConfigPath
 * @param {object} Meteor
 * @param {object} argv
 * @returns {Promise<{ nextUserConfig: object|null, nextOverrideConfig: object|null }>}
 */
async function loadUserAndOverrideConfig(projectConfigPath, Meteor, argv) {
  let nextUserConfig = null;
  let nextOverrideConfig = null;

  const projectDir = process.cwd();
  const isMeteorPackageConfig = projectDir.includes("/packages/rspack");

  if (projectConfigPath) {
    const configDir = path.dirname(projectConfigPath);
    const configFileName = path.basename(projectConfigPath);
    const configExt = path.extname(configFileName);
    const configNameWithoutExt = configFileName.replace(configExt, '');
    const configNameFull = `${configNameWithoutExt}.override${configExt}`;
    const overrideConfigPath = path.join(configDir, configNameFull);

    if (fs.existsSync(overrideConfigPath)) {
      nextOverrideConfig = await loadAndProcessConfig(
        overrideConfigPath,
        configNameFull,
        Meteor,
        argv,
        Meteor.isAngularEnabled
      );
    }

    if (fs.existsSync(projectConfigPath) && !isMeteorPackageConfig) {
      // Check if there's a .mjs or .cjs version of the config file
      const mjsConfigPath = projectConfigPath.replace(/\.js$/, '.mjs');
      const cjsConfigPath = projectConfigPath.replace(/\.js$/, '.cjs');

      let projectConfigPathToUse = projectConfigPath;
      if (fs.existsSync(mjsConfigPath)) {
        projectConfigPathToUse = mjsConfigPath;
      } else if (fs.existsSync(cjsConfigPath)) {
        projectConfigPathToUse = cjsConfigPath;
      }

      nextUserConfig = await loadAndProcessConfig(
        projectConfigPathToUse,
        'rspack.config.js',
        Meteor,
        argv,
        Meteor.isAngularEnabled
      );
    }
  }

  return { nextUserConfig, nextOverrideConfig };
}

module.exports = {
  loadAndProcessConfig,
  loadUserAndOverrideConfig,
};
