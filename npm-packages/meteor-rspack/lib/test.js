const fs = require('fs');
const path = require('path');
const {
  createIgnoreRegex,
  createIgnoreGlobConfig,
  createProjectIgnoreRegex,
} = require("./ignore.js");

// Normalize a path to always use forward slashes (POSIX style).
// Module identifiers in bundled JS must use '/' regardless of OS.
const toPosix = (p) => p.replace(/\\/g, '/');

const createRstestTestFileRegistration = ({
  isRstestTest,
  environment = process.env,
}) => {
  if (!isRstestTest) return undefined;
  const upstreamRuntime = environment.METEOR_RSTEST_UPSTREAM_RUNTIME === '1';
  return {
    module: 'meteor/rstest',
    exportName: upstreamRuntime
      ? '__registerTestFileLoader'
      : '__registerTestFile',
    mode: 'sync',
    ...(upstreamRuntime && {
      runtimeFactory: {
        module: '@meteorjs/rstest/runtime',
        exportName: 'createMeteorRstestFileRuntime',
        registrationExportName: '__setRstestRuntimeFactory',
      },
    }),
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
  const runtimePath = resolveModule(
    '@rstest/core/internal/browser-runtime',
    { paths: searchPaths },
  );
  return { '@rstest/core$': runtimePath };
};

const enforceRstestRuntimeAlias = (config, alias) => {
  if (!alias) return config;
  config.resolve ||= {};
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    ...alias,
  };
  return config;
};

const enforceRstestRuntimeOptimization = (config, upstreamRuntime) => {
  if (!upstreamRuntime) return config;
  config.optimization ||= {};
  config.optimization.usedExports = false;
  config.optimization.minimize = false;
  return config;
};

/**
 * Generates eager test files dynamically
 * @param {Object} options - Options for generating the test file
 * @param {boolean} options.isAppTest - Whether this is an app test
 * @param {string} options.projectDir - The project directory
 * @param {string} [options.discoveryRoot] - Root scanned by the eager context
 * @param {string[]} [options.includeFiles] - Exact files allowed under discoveryRoot
 * @param {{module: string, exportName: string, mode?: 'sync'|'lazy', runtimeFactory?: {module: string, exportName: string, registrationExportName: string}}} [options.testFileRegistration]
 *        Optional module API wrapping each discovered test-file evaluation
 * @param {string} options.buildContext - The build context
 * @param {string} [options.localDir] - Meteor local directory
 * @param {string[]} options.ignoreEntries - Array of ignore patterns
 * @param {string[]} options.meteorIgnoreEntries - Array of meteor ignore patterns
 * @param {string} options.extraEntry - Extra entry to load
 * @returns {string} The path to the generated file
 */
const generateEagerTestFile = ({
  isAppTest,
  projectDir,
  discoveryRoot = projectDir,
  includeFiles,
  testFileRegistration,
  buildContext,
  localDir = process.env.METEOR_LOCAL_DIR || '.meteor/local',
  ignoreEntries: inIgnoreEntries = [],
  meteorIgnoreEntries: inMeteorIgnoreEntries = [],
  prefix: inPrefix = '',
  extraEntry,
  globalImportPath,
}) => {
  const registrationMode = testFileRegistration?.mode || 'sync';
  if (testFileRegistration && !['sync', 'lazy'].includes(registrationMode)) {
    throw new Error(`Unsupported test file registration mode: ${registrationMode}`);
  }
  if (registrationMode === 'lazy' && !testFileRegistration.runtimeFactory) {
    throw new Error('Lazy test file registration requires a runtime factory.');
  }
  const distDir = path.resolve(projectDir, localDir, 'test');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Combine all ignore entries
  const ignoreEntries = [
    "**/node_modules/**",
    "**/.meteor/**",
    "**/public/**",
    "**/private/**",
    "**/packages/**",
    "**/tests/rstest/pure/**",
    "**/tests/rstest/browser/**",
    "**/tests/rstest/e2e/**",
    `**/${buildContext}/**`,
    ...inIgnoreEntries,
  ];

  // Create regex from ignore entries
  const excludeFoldersRegex = createProjectIgnoreRegex(
    projectDir,
    createIgnoreGlobConfig(ignoreEntries)
  );
  // Create regex from meteor ignore entries
  const excludeMeteorIgnoreRegex = inMeteorIgnoreEntries.length > 0
    ? createIgnoreRegex(createIgnoreGlobConfig(inMeteorIgnoreEntries))
    : null;

  const prefix = (inPrefix && `${inPrefix}-`) || "";
  const filename = isAppTest
    ? `${prefix}eager-app-tests.mjs`
    : `${prefix}eager-tests.mjs`;
  const filePath = path.resolve(distDir, filename);
  const resolvedDiscoveryRoot = path.resolve(discoveryRoot);
  const relativeDiscoveryRoot = toPosix(
    path.relative(projectDir, resolvedDiscoveryRoot),
  );
  const includedRelativeFiles = includeFiles && includeFiles
    .map(filePath => path.relative(resolvedDiscoveryRoot, filePath))
    .filter(relative => relative && !relative.startsWith(`..${path.sep}`))
    .map(relative => toPosix(relative).replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&'));
  const regExp = includeFiles
    ? includedRelativeFiles.length > 0
      ? new RegExp(`^(?:\\./)?(?:${includedRelativeFiles.join('|')})$`).toString()
      : '/a^/'
    : isAppTest
      ? "/\\.app-(?:test|spec)s?\\.[^.]+$/"
      : "/\\.(?:test|spec)s?\\.[^.]+$/";

  const registrationIteration = testFileRegistration
    ? `.forEach((file) => __meteorRegisterTestFile(
    [__meteorTestFileRoot, file.replace(/^\\.\\//, '')].filter(Boolean).join('/'),
    () => ctx(file),
  ))`
    : '.forEach(ctx)';
  const runtimeFactory = testFileRegistration?.runtimeFactory;
  const registrationImport = testFileRegistration
    ? `import { ${testFileRegistration.exportName} as __meteorRegisterTestFile${
      runtimeFactory
        ? `, ${runtimeFactory.registrationExportName} as __meteorSetRstestRuntimeFactory`
        : ''
    } } from ${JSON.stringify(testFileRegistration.module)};\n${
      runtimeFactory
        ? `import { ${runtimeFactory.exportName} as __meteorCreateRstestRuntime } from ${JSON.stringify(runtimeFactory.module)};\n__meteorSetRstestRuntimeFactory(__meteorCreateRstestRuntime);\n`
        : ''
    }`
    : '';
  const registrationRoot = testFileRegistration
    ? `const __meteorTestFileRoot = ${JSON.stringify(relativeDiscoveryRoot)};\n`
    : '';
  const discoveryContent = fs.existsSync(resolvedDiscoveryRoot) ? `{
  const ctx = import.meta.webpackContext('${toPosix(resolvedDiscoveryRoot)}', {
    recursive: true,
    regExp: ${regExp},
    exclude: ${excludeFoldersRegex.toString()},
    mode: ${testFileRegistration ? `'${registrationMode}'` : "'eager'"},
  });
  ctx.keys().filter((k) => {
    ${
      excludeMeteorIgnoreRegex
        ? `// Only exclude based on *relative* path segments.
    return !MeteorIgnoreRegex.test(k);`
        : "return true;"
    }
  })${registrationIteration};
}` : '';
  const extraContent = extraEntry ? `{
  const extra = import.meta.webpackContext('${toPosix(path.dirname(
    extraEntry
  ))}', {
    recursive: false,
    regExp: ${new RegExp(`${path.basename(extraEntry)}$`).toString()},
    mode: 'eager',
  });
  extra.keys().forEach(extra);
}` : '';
  const content = `${registrationImport}${
    globalImportPath ? `import '${toPosix(globalImportPath)}';\n\n` : ""
  }${
    excludeMeteorIgnoreRegex
      ? `const MeteorIgnoreRegex = ${excludeMeteorIgnoreRegex.toString()};`
      : ""
  }
${registrationRoot}
${discoveryContent}
${extraContent}`;

  fs.writeFileSync(filePath, content);
  return filePath;
};

module.exports = {
  createRstestRuntimeAlias,
  createRstestTestFileRegistration,
  enforceRstestRuntimeAlias,
  enforceRstestRuntimeOptimization,
  generateEagerTestFile,
};
