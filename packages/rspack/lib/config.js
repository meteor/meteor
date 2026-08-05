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
  isMeteorAppNative,
  isMeteorAppDebug,
  isMeteorAppTest,
  isMeteorAppTestFullApp,
  isMeteorAppConfigModernVerbose,
  isMeteorHtmlProject,
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
 * Reads root .meteorignore entries in their original order.
 * Reappending these entries after integration-generated negations preserves
 * the user's ignore precedence.
 * @returns {string[]} Parsed ignore entries
 */
function getMeteorIgnoreEntries() {
  const meteorIgnorePath = path.join(getMeteorAppDir(), '.meteorignore');
  if (!fs.existsSync(meteorIgnorePath)) {
    return [];
  }

  try {
    return fs.readFileSync(meteorIgnorePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    return [];
  }
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
    isMeteorHtmlProject() || isMeteorLessProject() || isMeteorScssProject();
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
  if (isMeteorHtmlProject()) {
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
  const meteorIgnoreEntries = getMeteorIgnoreEntries();

  // Ignore node_modules to prevent Meteor from processing them
  const projectRootFilesAndFolders = getMeteorAppFilesAndFolders({
    recursive: false,
  });

  const initialEntrypointContexts = [
    initialEntrypoints.mainClient,
    initialEntrypoints.mainServer,
  ]
    .filter(Boolean)
    .map(entrypoint => path.dirname(entrypoint));
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

  // Keep CSS/HTML files in entrypoint contexts visible to Meteor unless the
  // later Rspack compilation reports an exact stylesheet it owns. Meteor's
  // ignore matcher needs separate zero-depth and nested patterns.
  extraFilesToIgnore = [
    ...extraFilesToIgnore,
    ...initialEntrypointContexts.flatMap(entrypoint => {
      return [
        `!${entrypoint}/*.html`,
        `!${entrypoint}/**/*.html`,
        `!${entrypoint}/*.css`,
        `!${entrypoint}/**/*.css`,
      ];
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
      file =>
        ![
          'package.json',
          '.meteorignore',
          'tsconfig.json',
          'postcss.config.js',
          'scss-config.json',
        ].includes(file),
    ),
  ];
  const filesToIgnore = [...rootFilesToIgnore, ...extraFilesToIgnore];
  const unignoredFilesAndFolders = buildUnignorePatterns(
    meteorAppConfig?.modules || [],
    { skipLevel: 1 },
  );
  const meteorAppIgnores = `${foldersToIgnore.join(' ')} ${filesToIgnore.join(
    ' ',
  )} ${unignoredFilesAndFolders.join(' ')} ${meteorIgnoreEntries.join(' ')}`.trim();
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
  const isTestEager =
    initialEntrypoints.testModule == null &&
    initialEntrypoints.testClient == null &&
    initialEntrypoints.testServer == null;
  const isTestModule = initialEntrypoints.testModule != null || isTestEager;
  const testClientModule = getBuildFilePath({
    isTest: true,
    ...env,
    ...commandRole,
    isTestModule,
    isClient: true,
  });
  const testServerModule = getBuildFilePath({
    isTest: true,
    ...env,
    ...commandRole,
    isTestModule,
    isServer: true,
  });

  let appEntrypoints = {
    mainClient: `${RSPACK_BUILD_CONTEXT}/${mainClientModule}`,
    mainServer: `${RSPACK_BUILD_CONTEXT}/${mainServerModule}`,
    ...((isTestModule && {
      testClient: `${RSPACK_BUILD_CONTEXT}/${testClientModule}`,
      testServer: `${RSPACK_BUILD_CONTEXT}/${testServerModule}`,
    }) || {
      testClient: `${RSPACK_BUILD_CONTEXT}/${testClientModule}`,
      testServer: `${RSPACK_BUILD_CONTEXT}/${testServerModule}`,
    }),
  };
  if (isMeteorAppTestFullApp()) {
    appEntrypoints = {
      ...appEntrypoints,
      mainClient: `${RSPACK_BUILD_CONTEXT}/${testClientModule}`,
      mainServer: `${RSPACK_BUILD_CONTEXT}/${testServerModule}`,
    };
  }
  // Set entry points in environment variables if they exist
  setMeteorAppEntrypoints(appEntrypoints);

  if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
    logInfo(`[i] App entrypoints: ${JSON.stringify(appEntrypoints, null, 2)}`);
  }

  // Ensure module files exist
  ensureModuleFilesExist();

  // Write content to module files
  if (isMeteorAppRun() && isMeteorAppDevelopment() && !isMeteorAppNative()) {
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

/**
 * Applies delegated extension ignore patterns for entry folder files.
 * Called after rspack's first compilation reports which extensions it handles.
 * Since Meteor awaits rspack compilation before scanning files, these patterns
 * are in place before Meteor processes any application files.
 *
 * Uses gitignore semantics: a later positive nested pattern (client, then
 * any subdirectories, then *.css) overrides the matching earlier negation
 * that was set in configureMeteorForRspack.
 *
 * @param {string[]} extensions - Array of extensions like ['.css', '.less']
 */
export function applyDelegatedExtensions(extensions) {
  if (!extensions || extensions.length === 0) return;

  const initialEntrypoints = getInitialEntrypoints();
  const entrypointContexts = [
    initialEntrypoints.mainClient,
    initialEntrypoints.mainServer,
  ]
    .filter(Boolean)
    .map(entrypoint => path.dirname(entrypoint));

  const ignorePatterns = [];
  for (const dir of entrypointContexts) {
    for (const ext of extensions) {
      // Older @meteorjs/rspack versions report extensions rather than exact
      // compiled files. Keep the legacy top-level behavior in that case so
      // unimported nested files remain available to Meteor's eager compilers.
      ignorePatterns.push(`${dir}/*${ext}`);
    }
  }

  if (ignorePatterns.length > 0) {
    // Re-append explicit modules, then user ignore rules. The user's final
    // .meteorignore match keeps the same precedence it has without Rspack.
    const meteorAppConfig = getMeteorAppConfig();
    const meteorIgnoreEntries = getMeteorIgnoreEntries();
    const unignoredFilesAndFolders = buildUnignorePatterns(
      meteorAppConfig?.modules || [],
      { skipLevel: 1 },
    );

    setMeteorAppIgnore(
      [
        ...ignorePatterns,
        ...unignoredFilesAndFolders,
        ...meteorIgnoreEntries,
      ].join(' ')
    );

    if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
      logInfo(`[i] Rspack delegated extensions: ${extensions.join(', ')} (ignored in entry folders)\n    ${process.env.METEOR_IGNORE}`);
    }
  }
}

/**
 * Delegates only entry-folder files that Rspack actually compiled.
 * Unimported nested HTML and stylesheet files stay visible to Meteor, while
 * imported files are not compiled a second time by Meteor plugins.
 *
 * @param {string[]} files - App-relative POSIX paths compiled by Rspack
 */
export function applyDelegatedFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return;

  const ignorePatterns = files
    .map(file => file.replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(file => file && !file.startsWith('../') && !path.isAbsolute(file));
  if (ignorePatterns.length === 0) return;

  const meteorAppConfig = getMeteorAppConfig();
  const meteorIgnoreEntries = getMeteorIgnoreEntries();
  const unignoredFilesAndFolders = buildUnignorePatterns(
    meteorAppConfig?.modules || [],
    { skipLevel: 1 },
  );

  setMeteorAppIgnore(
    [
      ...ignorePatterns,
      ...unignoredFilesAndFolders,
      ...meteorIgnoreEntries,
    ].join(' ')
  );

  if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
    logInfo(`[i] Rspack delegated files: ${ignorePatterns.join(', ')}`);
  }
}
