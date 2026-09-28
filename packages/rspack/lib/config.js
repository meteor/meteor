/**
 * @module config
 * @description Functions for configuring Meteor for Rspack
 */
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
  getMeteorAppEntrypoints,
  getMeteorAppDir,
} = require('meteor/tools-core/lib/meteor');
const { buildUnignorePatterns } = require('meteor/tools-core/lib/ignore');

import { getInitialEntrypoints } from './build-context';
import { getRspackFileExtensionsToIgnore } from './file-extensions';
import { getClientArchitectureEntries, getDefaultClientScriptArchitectures } from './architectures';

const { ensureModuleFilesExist, getBuildFilePath } = require('./build-context');
const {
  RSPACK_BUILD_CONTEXT,
  getRspackChunksContext,
  FILE_ROLE,
} = require('./constants');

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
 * Gets the bounded list of extensions owned by the default Rspack integration.
 * This path is needed when Meteor compiler inputs prevent ignoring entire app
 * directories. Optional loader formats stay visible to Meteor and can be
 * delegated after Rspack's first compilation.
 * @returns {string[]} Array of file extensions to ignore
 */
function getFileExtensionsToIgnore() {
  if (
    !isMeteorHtmlProject() &&
    !isMeteorLessProject() &&
    !isMeteorScssProject()
  ) {
    return [];
  }

  return getRspackFileExtensionsToIgnore();
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
  const isTest = isMeteorAppTest();
  const isTestFullApp = isMeteorAppTestFullApp();

  // Ignore node_modules to prevent Meteor from processing them
  const projectRootFilesAndFolders = getMeteorAppFilesAndFolders({
    recursive: false,
  });

  const initialEntrypointContexts = [
    initialEntrypoints.mainClient,
    initialEntrypoints.mainServer,
    ...getClientArchitectureEntries().map(entry => entry.entryFile),
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

  const normalTestIgnorePath = `${RSPACK_BUILD_CONTEXT}/${path.dirname(
    getBuildFilePath({
      isTest: true,
    }),
  )}*/**`;
  const fullAppTestIgnorePath = `${RSPACK_BUILD_CONTEXT}/${path.dirname(
    getBuildFilePath({
      isTest: true,
      isTestFullApp: true,
    }),
  )}*/**`;
  const testIgnorePaths = isTest
    ? [isTestFullApp ? normalTestIgnorePath : fullAppTestIgnorePath]
    : [normalTestIgnorePath, fullAppTestIgnorePath];
  const otherMainIgnorePath =
    (isMeteorAppDevelopment() &&
      `${RSPACK_BUILD_CONTEXT}/${path.dirname(
        getBuildFilePath({
          isMain: true,
          isProduction: true,
        }),
      )}*/**`) ||
    `${RSPACK_BUILD_CONTEXT}/${path.dirname(
      getBuildFilePath({
        isMain: true,
        isDevelopment: true,
      }),
    )}*/**`;
  const foldersToIgnore = [
    // Cross-process isolation: a single app directory can host several Meteor
    // instances at once (a dev server, a `meteor test` daemon, an E2E run),
    // each with its own RSPACK_BUILD_CONTEXT (_build, _build-daemon,
    // _build-local-upstream-3.5.2, ...). Ignore every build context here, then
    // re-include only our own below; otherwise each instance watches the
    // others' output writes and treats them as source edits, looping on
    // spurious "Client modified -- refreshing" rebuilds.
    '/_build',
    '/_build-*',
    `!/${RSPACK_BUILD_CONTEXT}`,
    `!/${RSPACK_BUILD_CONTEXT}/**`,
    ...testIgnorePaths,
    otherMainIgnorePath,
    '**/node_modules/**',
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
  const rspackOutputFilesToIgnore =
    isMeteorAppDevelopment() && isMeteorAppRun() && !isMeteorAppNative()
      ? [
          `${RSPACK_BUILD_CONTEXT}/**/*-rspack.js`,
          `${RSPACK_BUILD_CONTEXT}/**/*-rspack.js.map`,
          `${RSPACK_BUILD_CONTEXT}/**/*-rspack.cjs`,
          `${RSPACK_BUILD_CONTEXT}/**/*-rspack.cjs.map`,
        ]
      : [];
  const filesToIgnore = [
    ...rootFilesToIgnore,
    ...extraFilesToIgnore,
    ...rspackOutputFilesToIgnore,
  ];
  const unignoredFilesAndFolders = buildUnignorePatterns(
    meteorAppConfig?.modules || [],
    { skipLevel: 1 },
  );
  const meteorAppIgnores = `${foldersToIgnore.join(' ')} ${filesToIgnore.join(
    ' ',
  )} ${unignoredFilesAndFolders.join(' ')} ${meteorIgnoreEntries.join(' ')}`.trim();

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
    isTestFullApp,
    ...env,
    ...commandRole,
    isTestModule,
    isClient: true,
  });
  const testServerModule = getBuildFilePath({
    isTest: true,
    isTestFullApp,
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
  if (isTestFullApp) {
    appEntrypoints = {
      ...appEntrypoints,
      mainClient: `${RSPACK_BUILD_CONTEXT}/${testClientModule}`,
      mainServer: `${RSPACK_BUILD_CONTEXT}/${testServerModule}`,
    };
  }
  const architectureEntries = getClientArchitectureEntries();
  const architectureModules = Object.fromEntries(architectureEntries.map(entry => [
    entry.arch,
    `${RSPACK_BUILD_CONTEXT}/${getBuildFilePath({ ...env, ...entry, ...commandRole })}`,
  ]));
  const replacements = {
    ...appEntrypoints,
    ...(isTest
      ? {
        testModule: architectureModules,
        // Meteor validates mainModule even for standalone tests, which exclude
        // the app's original sources. Disable those main entries; full-app
        // tests instead use wrappers containing both application and test code.
        mainModule: isTestFullApp ? architectureModules : Object.fromEntries([
          ...getClientArchitectureEntries({ isTest: false }),
          ...architectureEntries,
        ].map(({ arch }) => [arch, false])),
      }
      : { mainModule: architectureModules }),
  };
  // Generated files must stay out of architectures with their own entrypoint.
  // Only the architectures using our replacement entries re-include them and
  // exclude the sources compiled by Rspack.
  setMeteorAppIgnore(`/_build /_build-* /${RSPACK_BUILD_CONTEXT}`, { root: true });
  setMeteorAppIgnore(meteorAppIgnores, {
    root: true,
    entrypoints: Object.values(appEntrypoints),
  });

  // Only expose the selected architecture's generated files to Meteor. Exclude
  // every mode so stale HTML from a previous run cannot add another arch's CSS.
  const architectureDirectories = architectureEntries.map(entry =>
    `${RSPACK_BUILD_CONTEXT}/*-${entry.arch.replaceAll('.', '-')}`
  );
  if (architectureDirectories.length) {
    setMeteorAppIgnore(architectureDirectories.map(dir => `/${dir}`).join(' '), {
      root: true,
      entrypoints: Object.values(appEntrypoints),
    });
  }
  for (const entry of architectureEntries) {
    const modulePath = architectureModules[entry.arch];
    const directory = path.dirname(modulePath);
    setMeteorAppIgnore([
      meteorAppIgnores,
      `/${RSPACK_BUILD_CONTEXT}/**`,
      `!/${directory}`,
      `!/${directory}/**`,
    ].join(' '), { root: true, entrypoints: [modulePath] });
  }

  // Set entry points in environment variables if they exist
  setMeteorAppEntrypoints(replacements);

  if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
    logInfo(`[i] App entrypoints: ${JSON.stringify(appEntrypoints, null, 2)}`);
  }

  // Ensure module files exist
  ensureModuleFilesExist();

  // Write content to module files
  if (isMeteorAppRun() && isMeteorAppDevelopment() && !isMeteorAppNative()) {
    const clientOutputPrefix = architectureEntries.length
      ? `${getRspackChunksContext(false, false, 'client')}/` : '';
    const customScriptUrl = `/__rspack__/${clientOutputPrefix}${getBuildFilePath({
      ...env,
      isMain: true,
      isClient: true,
      role: FILE_ROLE.output,
      onlyFilename: true,
    })}`;
    setMeteorAppCustomScriptUrl(customScriptUrl, {
      archs: getDefaultClientScriptArchitectures(),
    });

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
export function applyDelegatedExtensions(extensions, { arch } = {}) {
  if (!extensions || extensions.length === 0) return;

  const initialEntrypoints = getInitialEntrypoints();
  const entrypointContexts = [
    initialEntrypoints.mainClient,
    initialEntrypoints.mainServer,
    ...getClientArchitectureEntries().filter(entry => entry.arch === arch)
      .map(entry => entry.entryFile),
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

    const entrypoints = arch
      ? [meteorAppConfig[isMeteorAppTest() ? 'testModule' : 'mainModule']?.[arch]]
      : Object.values(getMeteorAppEntrypoints());
    setMeteorAppIgnore(
      [
        ...ignorePatterns,
        ...unignoredFilesAndFolders,
        ...meteorIgnoreEntries,
      ].join(' '),
      { root: true, entrypoints: entrypoints.filter(value => typeof value === 'string') },
    );

    if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
      logInfo(`[i] Rspack delegated extensions: ${extensions.join(', ')} (ignored in entry folders)\n    ${process.env.METEOR_IGNORE_ROOT_BY_ENTRYPOINT}`);
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
export function applyDelegatedFiles(files, { arch } = {}) {
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

  const entrypoints = arch
    ? [meteorAppConfig[isMeteorAppTest() ? 'testModule' : 'mainModule']?.[arch]]
    : Object.values(getMeteorAppEntrypoints());
  setMeteorAppIgnore(
    [
      ...ignorePatterns,
      ...unignoredFilesAndFolders,
      ...meteorIgnoreEntries,
    ].join(' '),
    { root: true, entrypoints: entrypoints.filter(value => typeof value === 'string') },
  );

  if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
    logInfo(`[i] Rspack delegated files: ${ignorePatterns.join(', ')}`);
  }
}
