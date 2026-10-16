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

/**
 * Generates eager test files dynamically
 * @param {Object} options - Options for generating the test file
 * @param {boolean} options.isAppTest - Whether this is an app test
 * @param {string} options.projectDir - The project directory
 * @param {string} [options.discoveryRoot] - Root scanned by the eager context
 * @param {string} [options.testFileRoot] - Logical prefix used in reported test IDs
 * @param {string[]} [options.includeFiles] - Exact files allowed under discoveryRoot
 * @param {string[]} [options.testFiles] - Project-relative filename filters for eager discovery
 * @param {string[]} [options.setupFiles] - Runtime setup modules loaded once per test file
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
  testFileRoot,
  includeFiles,
  testFiles = [],
  setupFiles = [],
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
  if (testFileRoot !== undefined && (
    typeof testFileRoot !== 'string' ||
    path.isAbsolute(testFileRoot) ||
    testFileRoot.split(/[\\/]/).includes('..')
  )) {
    throw new Error('Test file root must be a project-relative path.');
  }
  const relativeDiscoveryPath = path.relative(projectDir, resolvedDiscoveryRoot);
  const relativeDiscoveryRoot = testFileRoot === undefined
    ? relativeDiscoveryPath === '..' ||
      relativeDiscoveryPath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeDiscoveryPath)
      ? ''
      : toPosix(relativeDiscoveryPath)
    : toPosix(testFileRoot);
  const includedRelativeFiles = includeFiles && includeFiles
    .map(filePath => path.relative(resolvedDiscoveryRoot, filePath))
    .filter(relative => relative && !relative.startsWith(`..${path.sep}`))
    .map(relative => toPosix(relative).replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&'));
  const testFileFilters = includeFiles ? [] : testFiles.map(file =>
    toPosix(path.isAbsolute(file) ? path.relative(projectDir, file) : file)
      .replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
  );
  const filenamePattern = isAppTest
    ? '\\.app-(?:test|spec)s?\\.[^.]+$'
    : '\\.(?:test|spec)s?\\.[^.]+$';
  const regExp = includeFiles
    ? includedRelativeFiles.length > 0
      ? new RegExp(`^(?:\\./)?(?:${includedRelativeFiles.join('|')})$`).toString()
      : '/a^/'
    : new RegExp(testFileFilters.length
      ? `^(?=.*(?:${testFileFilters.join('|')})).*${filenamePattern}`
      : filenamePattern).toString();

  const registrationIteration = testFileRegistration
    ? `.map((file) => __meteorRegisterTestFile(
    [__meteorTestFileRoot, file.replace(/^\\.\\//, '')].filter(Boolean).join('/'),
    () => (__meteorTestSetupLoaders[file] || []).reduce(
      (pending, loadSetup) => pending.then(loadSetup),
      Promise.resolve(),
    ).then(() => ctx(file)),
  ))`
    : '.map(ctx)';
  const runtimeFactory = testFileRegistration?.runtimeFactory;
  const registrationImport = testFileRegistration
    ? `import { ${testFileRegistration.exportName} as __meteorRegisterTestFile${
      runtimeFactory
        ? `, ${runtimeFactory.registrationExportName} as __meteorSetTestRuntimeFactory`
        : ''
    } } from ${JSON.stringify(testFileRegistration.module)};\n${
      runtimeFactory
        ? `import { ${runtimeFactory.exportName} as __meteorCreateTestRuntime } from ${JSON.stringify(runtimeFactory.module)};\n__meteorSetTestRuntimeFactory(__meteorCreateTestRuntime);\n`
        : ''
    }`
    : '';
  const registrationRoot = testFileRegistration
    ? `const __meteorTestFileRoot = ${JSON.stringify(relativeDiscoveryRoot)};\n`
    : '';
  const setupLoaderEntries = testFileRegistration && includeFiles
    ? includeFiles.map(testFile => {
      const relative = toPosix(path.relative(resolvedDiscoveryRoot, testFile));
      const key = `./${relative}`;
      const loaders = setupFiles.map((setupFile, index) => {
        const query = encodeURIComponent(`${relative}:${index}`);
        const request = `${toPosix(setupFile)}?meteor-test-setup=${query}`;
        return `() => import(/* webpackMode: "eager" */ ${JSON.stringify(request)})`;
      });
      return `${JSON.stringify(key)}: [${loaders.join(', ')}]`;
    })
    : [];
  const setupLoaderMap = testFileRegistration
    ? `const __meteorTestSetupLoaders = {${setupLoaderEntries.join(',')}};\n`
    : '';
  const discoveryContent = fs.existsSync(resolvedDiscoveryRoot) ? `{
  const ctx = import.meta.webpackContext('${toPosix(resolvedDiscoveryRoot)}', {
    recursive: true,
    regExp: ${regExp},
    exclude: ${excludeFoldersRegex.toString()},
    mode: ${testFileRegistration ? `'${registrationMode}'` : "'eager'"},
  });
  await Promise.all(ctx.keys().filter((k) => {
    ${
      excludeMeteorIgnoreRegex
        ? `// Only exclude based on *relative* path segments.
    return !MeteorIgnoreRegex.test(k);`
        : "return true;"
    }
  })${registrationIteration});
}` : '';
  const extraContent = extraEntry ? `{
  const extra = import.meta.webpackContext('${toPosix(path.dirname(
    extraEntry
  ))}', {
    recursive: false,
    regExp: ${new RegExp(`${path.basename(extraEntry)}$`).toString()},
    mode: 'eager',
  });
  await Promise.all(extra.keys().map(extra));
}` : '';
  const content = `${registrationImport}${
    globalImportPath ? `import '${toPosix(globalImportPath)}';\n\n` : ""
  }${
    excludeMeteorIgnoreRegex
      ? `const MeteorIgnoreRegex = ${excludeMeteorIgnoreRegex.toString()};`
      : ""
  }
${registrationRoot}${setupLoaderMap}
${discoveryContent}
${extraContent}`;

  fs.writeFileSync(filePath, content);
  return filePath;
};

module.exports = {
  generateEagerTestFile,
};
