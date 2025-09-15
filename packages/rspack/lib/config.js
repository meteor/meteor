/**
 * @module config
 * @description Functions for configuring Meteor for Rspack
 */
import { glob } from 'glob';
import path from 'path';
import fs from 'fs';

const { logInfo } = require('meteor/tools-core/lib/log');
const {
  getMeteorAppFilesAndFolders,
  setMeteorAppIgnore,
  setMeteorAppEntrypoints,
  setMeteorAppCustomScriptUrl,
  isMeteorAppDevelopment,
  isMeteorAppRun,
  isMeteorAppBuild,
  isMeteorAppDebug,
  isMeteorAppTest,
  isMeteorAppConfigModernVerbose,
  isMeteorBlazeProject,
  isMeteorLessProject,
  isMeteorScssProject,
  getMeteorEnvPackageDirs,
  getMeteorAppConfig,
  getMeteorAppDir,
} = require('meteor/tools-core/lib/meteor');
const { buildUnignorePatterns } = require('meteor/tools-core/lib/ignore');

import { getInitialEntrypoints } from './build-context';

const { ensureModuleFilesExist, getBuildFilePath } = require('./build-context');
const { RSPACK_BUILD_CONTEXT, FILE_ROLE } = require('./constants');

/**
 * Checks if exact entries exist in the .meteorignore file
 * @param {string[]} entries - Array of exact entries to check for
 * @returns {Object} Object with keys corresponding to each entry and values as booleans
 */
function checkMeteorIgnoreExactEntries(entries) {
  const meteorIgnorePath = path.join(getMeteorAppDir(), '.meteorignore');
  const results = {};

  // Initialize results object with false for each entry
  entries.forEach(entry => {
    results[entry] = false;
  });

  // Check if .meteorignore file exists
  if (!fs.existsSync(meteorIgnorePath)) {
    return results;
  }

  // Read the .meteorignore file
  try {
    const content = fs.readFileSync(meteorIgnorePath, 'utf8');
    const lines = content.split('\n');

    // Check each line against all entries
    lines.forEach(line => {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) {
        return;
      }

      const trimmedLine = line.trim();

      // Check for exact matches
      entries.forEach(entry => {
        if (trimmedLine === entry) {
          results[entry] = true;
        }
      });
    });
  } catch (error) {
    // If there's an error reading the file, return the initialized results
  }

  return results;
}

/**
 * Gets the list of file extensions to ignore based on project type
 * For Blaze projects, it excludes .html as used by Blaze
 * For Less projects, it excludes .less files
 * For SCSS projects, it excludes .scss files
 * @returns {string[]} Array of file extensions to ignore
 */
function getFileExtensionsToIgnore() {
  const isAnyCompilerProject =
    isMeteorBlazeProject() || isMeteorLessProject() || isMeteorScssProject();
  if (!isAnyCompilerProject) {
    return [];
  }

  const allFiles = glob.sync('**/*', {
    nodir: true,
    dot: true,
    ignore: ['node_modules/**', '.meteor/**'],
  });
  const existingExts = Array.from(
    new Set(allFiles.map(f => path.extname(f).toLowerCase())),
  );

  // Base extensions to ignore
  const baseExtensions = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
  ];

  // Filter existing extensions based on project type
  let filteredExts = existingExts;

  // For Blaze projects, exclude .html files
  if (isMeteorBlazeProject()) {
    filteredExts = existingExts.filter(ext => ext !== '.html');
  }

  // Check for Less projects and exclude .less files
  if (isMeteorLessProject()) {
    filteredExts = filteredExts.filter(ext => ext !== '.less');
  }

  // Check for SCSS projects and exclude .scss files
  if (isMeteorScssProject()) {
    filteredExts = filteredExts.filter(ext => ext !== '.scss');
  }

  return Array.from(new Set([...baseExtensions, ...filteredExts])).filter(
    ext => ext !== '',
  );
}

/**
 * Configures Meteor settings for Rspack
 * Sets up file ignores, entry points, and custom script URL
 * Creates necessary module files and writes content to them
 * @returns {void}
 */
export function configureMeteorForRspack() {
  const meteorAppConfig = getMeteorAppConfig();
  const initialEntrypoints = getInitialEntrypoints();

  // Ignore node_modules to prevent Meteor from processing them
  const projectRootFilesAndFolders = getMeteorAppFilesAndFolders({
    recursive: false,
  });

  const initialEntrypointContexts = [
    initialEntrypoints.mainClient,
    initialEntrypoints.mainServer,
  ].map(entrypoint => path.dirname(entrypoint));
  const includedDirs = ['public', 'private', '.meteor', RSPACK_BUILD_CONTEXT];
  const ignoredDirs = projectRootFilesAndFolders.directories.filter(
    dir => !includedDirs.includes(dir),
  );

  const envPackageDirs = getMeteorEnvPackageDirs().map(
    dir => path.normalize(dir)?.split(path.sep)?.filter(Boolean)?.[0],
  );
  let extraFoldersToIgnore = [
    ...ignoredDirs
      .filter(
        dir =>
          ![
            'public',
            'private',
            '.meteor',
            'packages',
            ...envPackageDirs,
            RSPACK_BUILD_CONTEXT,
          ].includes(dir),
      )
      .map(dir => `${dir}/**`),
  ];
  let extraFilesToIgnore = [];

  // Get extensions to ignore based on project type
  const extensionsToIgnore = getFileExtensionsToIgnore();
  // If we have extensions to ignore, apply them to the ignored directories
  if (extensionsToIgnore.length > 0) {
    extraFilesToIgnore = ignoredDirs.flatMap(dir =>
      extensionsToIgnore.map(ext => `${dir}/**/*${ext}`),
    );
    extraFoldersToIgnore = [];
  }

  // Skip immediate html and css children from intial entrypoint contexts
  extraFilesToIgnore = [
    ...extraFilesToIgnore,
    ...initialEntrypointContexts.flatMap(entrypoint => {
      // Create exact entries to check for
      const cssEntry = `${entrypoint}/*.css`;
      const htmlEntry = `${entrypoint}/*.html`;

      // Check all entries at once
      const entryResults = checkMeteorIgnoreExactEntries([cssEntry, htmlEntry]);
      const hasMatchingCssEntry = entryResults[cssEntry];
      const hasMatchingHtmlEntry = entryResults[htmlEntry];

      // Prepare the result array
      const result = [];

      // Only add the HTML ignore pattern if there's no matching HTML entry in .meteorignore
      if (!hasMatchingHtmlEntry) {
        result.push(`!${htmlEntry}`);
      }

      // Only add the CSS ignore pattern if there's no matching CSS entry in .meteorignore
      if (!hasMatchingCssEntry) {
        result.push(`!${cssEntry}`);
      }

      return result;
    }),
  ];

  const testIgnorePath = `${RSPACK_BUILD_CONTEXT}/${path.dirname(
    getBuildFilePath({
      isTest: true,
    }),
  )}/**`;
  const otherMainIgnorePath =
    (isMeteorAppDevelopment() &&
      `${RSPACK_BUILD_CONTEXT}/${path.dirname(
        getBuildFilePath({
          isMain: true,
          isProduction: true,
        }),
      )}/**`) ||
    `${RSPACK_BUILD_CONTEXT}/${path.dirname(
      getBuildFilePath({
        isMain: true,
        isDevelopment: true,
      }),
    )}/**`;
  const foldersToIgnore = [
    ...((isMeteorAppTest() && [otherMainIgnorePath]) || [
      testIgnorePath,
      otherMainIgnorePath,
    ]),
    'node_modules/**',
    ...extraFoldersToIgnore,
  ].filter(Boolean);
  const rootFilesToIgnore = [
    ...projectRootFilesAndFolders.files.filter(
      file => !['package.json', '.meteorignore', 'tsconfig.json'].includes(file),
    ),
  ];
  const filesToIgnore = [...rootFilesToIgnore, ...extraFilesToIgnore];
  const unignoredFilesAndFolders = buildUnignorePatterns(
    meteorAppConfig?.modules || [],
    { skipLevel: 1 },
  );
  const meteorAppIgnores = `${foldersToIgnore.join(' ')} ${filesToIgnore.join(
    ' ',
  )} ${unignoredFilesAndFolders.join(' ')}`.trim();
  setMeteorAppIgnore(meteorAppIgnores);

  if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
    logInfo(`[i] Meteor app ignores: ${meteorAppIgnores}`);
  }

  const env = isMeteorAppDevelopment()
    ? { isDevelopment: true }
    : { isProduction: true };
  const commandRole = isMeteorAppRun()
    ? { role: FILE_ROLE.run }
    : isMeteorAppBuild()
    ? { role: FILE_ROLE.build }
    : { role: FILE_ROLE.run };
  const mainClientModule = getBuildFilePath({
    isMain: true,
    ...env,
    ...commandRole,
    isClient: true,
  });
  const mainServerModule = getBuildFilePath({
    isMain: true,
    ...env,
    ...commandRole,
    isServer: true,
  });
  const testClientModule = getBuildFilePath({
    isTest: true,
    ...env,
    ...commandRole,
    isClient: true,
  });
  const isTestEager =
    initialEntrypoints.testModule == null &&
    initialEntrypoints.testClient == null &&
    initialEntrypoints.testServer == null;
  const isTestModule = initialEntrypoints.testModule != null || isTestEager;
  const testServerModule = getBuildFilePath({
    isTest: true,
    ...env,
    ...commandRole,
    isTestModule,
    isServer: true,
  });

  const appEntrypoints = {
    mainClient: `${RSPACK_BUILD_CONTEXT}/${mainClientModule}`,
    mainServer: `${RSPACK_BUILD_CONTEXT}/${mainServerModule}`,
    ...((isTestModule && {
      testModule: `${RSPACK_BUILD_CONTEXT}/${testServerModule}`,
    }) || {
      testClient: `${RSPACK_BUILD_CONTEXT}/${testClientModule}`,
      testServer: `${RSPACK_BUILD_CONTEXT}/${testServerModule}`,
    }),
  };
  // Set entry points in environment variables if they exist
  setMeteorAppEntrypoints(appEntrypoints);

  if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
    logInfo(`[i] App entrypoints: ${JSON.stringify(appEntrypoints, null, 2)}`);
  }

  // Ensure module files exist
  ensureModuleFilesExist();

  // Write content to module files
  if (isMeteorAppRun() && isMeteorAppDevelopment()) {
    const customScriptUrl = `/__rspack__/${getBuildFilePath({
      ...env,
      isMain: true,
      isClient: true,
      role: FILE_ROLE.output,
      onlyFilename: true,
    })}`;
    setMeteorAppCustomScriptUrl(customScriptUrl);

    if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
      logInfo(`[i] App custom script: ${customScriptUrl}`);
    }
  }
}
