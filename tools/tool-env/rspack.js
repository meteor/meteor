// Helper functions for Rspack integration
const files = require('../fs/files');
const path = require('path');
const { getMeteorConfig } = require("./meteor-config");

const config = getMeteorConfig();

// Derive the METEOR_LOCAL_DIR suffix the same way packages/rspack/lib/constants.js does,
// so reset cleans the correct directories when running multiple instances.
const meteorLocalDirName = process.env.METEOR_LOCAL_DIR
  ? path.basename(process.env.METEOR_LOCAL_DIR.replace(/\\/g, '/'))
  : '';
const localDirSuffix = meteorLocalDirName ? `-${meteorLocalDirName}` : '';

// Get the build context from environment variable or use default "_build"
const rspackBuildContext = config?.buildContext || process.env.RSPACK_BUILD_CONTEXT || `_build${localDirSuffix}`;

// Get the assets context from environment variable or use default "build-assets"
const rspackAssetsContext = config?.assetsContext || process.env.RSPACK_ASSETS_CONTEXT || `build-assets${localDirSuffix}`;

// Get the bundles context from environment variable or use default "build-chunks"
const rspackChunksContext = config?.chunksContext || process.env.RSPACK_CHUNKS_CONTEXT || `build-chunks${localDirSuffix}`;

// Cache the regex pattern for performance
const rspackFilePattern = new RegExp(`^${rspackBuildContext}\\/.*\\/[^\\/]*-rspack\\.js$`);

// Export the variables for use in other files
exports.rspackBuildContext = rspackBuildContext;
exports.rspackAssetsContext = rspackAssetsContext;
exports.rspackChunksContext = rspackChunksContext;
exports.rspackFilePattern = rspackFilePattern;

// Function to check if a file is a Rspack output file
exports.isRspackOutputFile = function(filePath) {
  return rspackFilePattern.test(filePath);
};

// Function to get the rspack resources contexts
exports.getRspackResourcesContexts = function() {
  return [
    rspackAssetsContext,
    rspackChunksContext
  ];
};

// Function to get the rspack app contexts for cleanup.
// Reads the app's package.json meteor config to resolve custom context names,
// and always includes the default paths to prevent regressions.
exports.getRspackAppContexts = function(appDir) {
  let appConfig = null;
  try {
    const pkgPath = files.pathJoin(appDir, 'package.json');
    if (files.exists(pkgPath)) {
      const pkg = JSON.parse(files.readFile(pkgPath, 'utf8'));
      appConfig = pkg?.meteor || null;
    }
  } catch (e) {
    // Fall back to defaults if package.json can't be read
  }

  const appBuildContext = appConfig?.buildContext || process.env.RSPACK_BUILD_CONTEXT || `_build${localDirSuffix}`;
  const appAssetsContext = appConfig?.assetsContext || process.env.RSPACK_ASSETS_CONTEXT || `build-assets${localDirSuffix}`;
  const appChunksContext = appConfig?.chunksContext || process.env.RSPACK_CHUNKS_CONTEXT || `build-chunks${localDirSuffix}`;

  const contexts = [
    files.pathJoin(appDir, "node_modules", ".cache", "rspack"),
  ];

  // Collect unique context names (configured + defaults to prevent regressions)
  const allNames = new Set([
    appBuildContext, '_build',
    appAssetsContext, 'build-assets',
    appChunksContext, 'build-chunks',
  ]);

  for (const name of allNames) {
    contexts.push(files.pathJoin(appDir, name));
    contexts.push(files.pathJoin(appDir, `public/${name}`));
    contexts.push(files.pathJoin(appDir, `private/${name}`));
  }

  // When METEOR_LOCAL_DIR is set, also include suffixed paths
  if (localDirSuffix) {
    for (const name of allNames) {
      const suffixed = `${name}${localDirSuffix}`;
      contexts.push(files.pathJoin(appDir, suffixed));
      contexts.push(files.pathJoin(appDir, `public/${suffixed}`));
      contexts.push(files.pathJoin(appDir, `private/${suffixed}`));
    }
  }

  return contexts;
};
