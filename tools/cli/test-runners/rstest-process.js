const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RSTEST_FILE = /\.(?:test|spec)s?\.(?:[cm]?[jt]sx?)$/i;
const APP_TEST_FILE = /\.app-(?:test|spec)s?\.(?:[cm]?[jt]sx?)$/i;
const COMPATIBILITY_IGNORED_DIRS = new Set([
  '.git', '.meteor', '.rsdoctor', '_build', 'node_modules', 'packages',
  'private', 'public',
]);
const RUNTIME_PROJECTS = new Set([
  'meteor-runtime-server',
  'meteor-runtime-client',
]);
const EXTERNAL_PROJECTS = new Set(['meteor-e2e']);
const GENERATED_PROJECTS = new Set([
  'meteor-pure-server',
  'meteor-pure-client',
  'meteor-browser',
  ...RUNTIME_PROJECTS,
  ...EXTERNAL_PROJECTS,
]);

function selectRstestLanes(projects) {
  const selected = [].concat(projects || []).filter(Boolean);
  if (selected.length === 0) return { native: true, runtime: true, external: true };
  return {
    native: selected.some(project =>
      !RUNTIME_PROJECTS.has(project) && !EXTERNAL_PROJECTS.has(project)
    ),
    runtime: selected.some(project => RUNTIME_PROJECTS.has(project)),
    external: selected.some(project => EXTERNAL_PROJECTS.has(project)),
  };
}

function configureRstestRuntimeMetadata({
  metadata,
  options,
  webArchs,
  createToken = () => require('node:crypto').randomBytes(24).toString('base64url'),
}) {
  const isRstest = metadata.testRunner === 'rstest';
  const hasDesktopBrowser = webArchs.some(arch =>
    arch === 'web.browser' || arch === 'web.browser.legacy'
  );
  const shouldRunRstestClient = Boolean(isRstest &&
    !options['server-only'] &&
    hasDesktopBrowser &&
    (options['test-packages'] ||
      (options.rstestRunRuntime &&
        (options.rstestHasRuntimeClient || options['client-only']))));
  const shouldRunRstestExternal = isRstest && Boolean(options.rstestHasExternal);
  const requiresDesktopBrowser = isRstest && !options['server-only'] && (
    options['test-packages'] ||
    (options.rstestRunRuntime && Boolean(options.rstestHasRuntimeClient)) ||
    shouldRunRstestExternal
  );

  if (isRstest) {
    metadata.rstestToken ||= createToken();
    metadata.rstestTestTimeout ??= 30000;
    metadata.rstestHookTimeout ??= 10000;
    metadata.rstestServer = !options['client-only'] &&
      (options['test-packages'] ||
        (options.rstestRunRuntime && Boolean(options.rstestHasRuntimeServer)));
    metadata.rstestClient = shouldRunRstestClient;
    metadata.rstestRuntime = Boolean(
      options['test-packages'] || options.rstestRunRuntime
    );
    metadata.rstestExternal = shouldRunRstestExternal;
  }

  return {
    hasDesktopBrowser,
    requiresDesktopBrowser,
    shouldRunRstestClient,
    shouldRunRstestExternal,
  };
}

function inspectAppRstestCapability(appDir) {
  if (!appDir) {
    return { hasRstestPackage: false, hasRstestConfig: false, packageJsonMeteor: {} };
  }
  let packages = '';
  let packageJson = {};
  try {
    packages = fs.readFileSync(path.join(appDir, '.meteor', 'packages'), 'utf8');
  } catch {}
  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  } catch {}

  const hasRstestPackage = packages.split(/\r?\n/).some(line => {
    const constraint = line.replace(/#.*/, '').trim();
    return /^rstest(?:@|$)/.test(constraint);
  });
  const hasRstestConfig = [
    '.js', '.ts', '.mjs', '.mts', '.cjs', '.cts',
  ].some(extension => fs.existsSync(path.join(appDir, `rstest.config${extension}`)));
  return {
    hasRstestPackage,
    hasRstestConfig,
    packageJsonMeteor: packageJson.meteor || {},
  };
}

function collectTestFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile() && RSTEST_FILE.test(entry.name)) files.push(filePath);
    }
  };
  visit(root);
  return files.sort();
}

function collectCompatibilityFiles(appDir, { fullApp = false } = {}) {
  const matcher = fullApp ? APP_TEST_FILE : RSTEST_FILE;
  const files = [];
  const visit = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && (
        COMPATIBILITY_IGNORED_DIRS.has(entry.name) ||
        entry.name.startsWith('build-assets') ||
        entry.name.startsWith('build-chunks')
      )) {
        continue;
      }
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile() && matcher.test(entry.name)) files.push(filePath);
    }
  };
  visit(appDir);

  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    const configured = packageJson.meteor && packageJson.meteor.testModule;
    for (const modulePath of typeof configured === 'string'
      ? [configured]
      : configured && typeof configured === 'object'
        ? Object.values(configured)
        : []) {
      if (typeof modulePath === 'string') files.push(path.resolve(appDir, modulePath));
    }
  } catch {}

  const nativeRoot = path.join(appDir, 'tests', 'rstest') + path.sep;
  return [...new Set(files)]
    .filter(filePath => !filePath.startsWith(nativeRoot))
    .sort();
}

function scanNativeRstestRoots(appDir, { fullApp = false } = {}) {
  const testsRoot = path.join(appDir, 'tests', 'rstest');
  const pureFiles = [
    ...collectTestFiles(path.join(testsRoot, 'pure')),
    ...collectTestFiles(path.join(testsRoot, 'browser')),
  ].sort();
  const runtimeFiles = collectTestFiles(path.join(testsRoot, 'runtime'));
  const externalFiles = collectTestFiles(path.join(testsRoot, 'e2e'));
  const legacyFiles = collectCompatibilityFiles(appDir, { fullApp });
  return {
    hasPure: pureFiles.length > 0,
    hasRuntime: runtimeFiles.length > 0,
    hasExternal: externalFiles.length > 0,
    pureFiles,
    runtimeFiles,
    externalFiles,
    legacyFiles,
  };
}

function testFileProject(filePath, appDir) {
  const relative = path.relative(appDir, filePath).split(path.sep).join('/');
  if (relative.startsWith('tests/rstest/pure/server/')) return 'meteor-pure-server';
  if (relative.startsWith('tests/rstest/pure/client/')) return 'meteor-pure-client';
  if (relative.startsWith('tests/rstest/browser/')) return 'meteor-browser';
  if (relative.startsWith('tests/rstest/runtime/server/')) return 'meteor-runtime-server';
  if (relative.startsWith('tests/rstest/runtime/client/')) return 'meteor-runtime-client';
  if (relative.startsWith('tests/rstest/e2e/')) return 'meteor-e2e';
  return null;
}

function globRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

function matchesTestFile(filePath, appDir, patterns) {
  if (!patterns || [].concat(patterns).filter(Boolean).length === 0) return true;
  const absolute = path.resolve(filePath).split(path.sep).join('/');
  const relative = path.relative(appDir, filePath).split(path.sep).join('/');
  return [].concat(patterns).filter(Boolean).some(pattern => {
    const normalized = String(pattern).replace(/\\/g, '/').replace(/^\.\//, '');
    const matcher = globRegExp(normalized);
    return matcher.test(path.isAbsolute(pattern) ? absolute : relative) ||
      (!normalized.includes('/') && matcher.test(path.posix.basename(relative)));
  });
}

function selectRstestInventory({ appDir, roots, projects, testFile }) {
  const selectedProjects = [].concat(projects || []).filter(Boolean);
  const unknownProjects = selectedProjects.filter(name => !GENERATED_PROJECTS.has(name));
  const acceptsProject = filePath => selectedProjects.length === 0 ||
    selectedProjects.includes(testFileProject(filePath, appDir));
  const select = files => files.filter(filePath =>
    acceptsProject(filePath) && matchesTestFile(filePath, appDir, testFile)
  );
  return {
    pureFiles: select(roots.pureFiles),
    runtimeFiles: select(roots.runtimeFiles),
    externalFiles: select(roots.externalFiles),
    compatibilityFiles: roots.legacyFiles.filter(filePath =>
      matchesTestFile(filePath, appDir, testFile)
    ),
    unknownProjects,
  };
}

function buildRstestArgs({
  appDir,
  localDir,
  harnessRoot,
  once,
  fullApp,
  server,
  client,
  command,
  config,
  project,
  testFile,
  testNamePattern,
  browser,
  coverage,
  updateSnapshots,
  shard,
  changed,
  changedSince,
  passWithNoTests,
  runtimePlanOutput,
  runtimeSettingsOutput,
  runtimeSettingsGeneration,
  resultOutput,
  architectures,
  phase,
  passthrough,
}) {
  const protectedPassthrough = [].concat(passthrough || []).find(argument =>
    /^(?:--config(?:=|$)|-c(?:=|$)|--root(?:=|$)|--project(?:=|$)|--passWithNoTests(?:=|$))/.test(
      String(argument),
    )
  );
  if (protectedPassthrough) {
    throw new Error(
      `[Meteor Rstest] ${protectedPassthrough} is Meteor-owned and cannot be passed after --. ` +
      'Use the corresponding meteor test option.'
    );
  }
  const args = ['--cwd', appDir, '--local-dir', localDir];
  if (harnessRoot) args.push('--harness-root', harnessRoot);
  if (once) args.push('--once');
  if (fullApp) args.push('--full-app');
  if (server && client === false) args.push('--server-only');
  if (client && server === false) args.push('--client-only');
  if (command === 'test-packages') args.push('--package-tests');
  args.push('--command', command);
  if (phase) args.push('--phase', phase);
  if (config) args.push('--config', config);
  for (const name of [].concat(project || [])) args.push('--project', name);
  for (const file of [].concat(testFile || [])) args.push('--test-file', file);
  if (testNamePattern) args.push('--test-name-pattern', testNamePattern);
  if (browser) args.push('--browser.name', browser);
  if (coverage) args.push('--coverage');
  if (updateSnapshots) args.push('--update');
  if (shard) args.push('--shard', shard);
  if (changed || changedSince) {
    args.push('--changed');
    if (changedSince) args.push(changedSince);
  }
  if (passWithNoTests) args.push('--passWithNoTests');
  if (runtimePlanOutput) args.push('--runtime-plan-output', runtimePlanOutput);
  if (runtimeSettingsOutput) args.push('--runtime-settings-output', runtimeSettingsOutput);
  if (runtimeSettingsGeneration) {
    args.push('--runtime-settings-generation', runtimeSettingsGeneration);
  }
  if (resultOutput) args.push('--result-output', resultOutput);
  for (const architecture of [].concat(architectures || [])) {
    args.push('--architecture', architecture);
  }
  if (passthrough && passthrough.length) args.push('--', ...passthrough.map(String));
  return args;
}

function resolveRstestBin(appDir) {
  let packageJson;
  try {
    packageJson = require.resolve('@meteorjs/rstest/package.json', { paths: [appDir] });
  } catch {
    const error = new Error(
      '[Meteor Rstest] Atmosphere package rstest is selected, but @meteorjs/rstest is missing. ' +
      'Run meteor npm install --save-dev @meteorjs/rstest@0.1.0-beta.0.'
    );
    error.code = 'METEOR_RSTEST_NPM_MISSING';
    throw error;
  }
  return path.join(path.dirname(packageJson), 'bin', 'meteor-rstest.js');
}

async function initializeRstestBuildPlugins(projectContext, {
  enterJob = (_packageName, operation) => operation(),
} = {}) {
  await projectContext.buildLocalPackages();
  for (const packageName of ['rspack', 'rstest-tooling']) {
    const isopack = projectContext.isopackCache.getIsopack(packageName);
    if (!isopack || typeof isopack.ensurePluginsInitialized !== 'function') {
      const error = new Error(
        `[Meteor Rstest] Required Atmosphere package ${packageName} did not provide its build plugin.`
      );
      error.code = packageName === 'rspack'
        ? 'METEOR_RSPACK_PLUGIN_MISSING'
        : 'METEOR_RSTEST_PLUGIN_MISSING';
      throw error;
    }
    await enterJob(packageName, () => isopack.ensurePluginsInitialized());
  }
}

function startRstestProcess({
  appDir,
  packageRoot = appDir,
  args,
  env = process.env,
  stdio = 'inherit',
}) {
  const bin = resolveRstestBin(packageRoot);
  const ownsProcessGroup = process.platform !== 'win32';
  const child = spawn(process.execPath, [bin, ...args], {
    cwd: appDir,
    env: { ...env, FORCE_COLOR: env.FORCE_COLOR || '1' },
    stdio,
    detached: ownsProcessGroup,
  });
  let settled = false;
  let stopped = false;
  const terminate = signal => {
    if (settled) return;
    if (process.platform === 'win32' && child.pid) {
      const taskkillArgs = ['/pid', String(child.pid), '/t'];
      if (signal === 'SIGKILL') taskkillArgs.push('/f');
      try {
        const killer = spawn('taskkill', taskkillArgs, { stdio: 'ignore' });
        killer.once('error', () => {
          try { child.kill(signal); } catch {}
        });
        return;
      } catch {}
    }
    if (ownsProcessGroup && child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {}
    }
    try {
      child.kill(signal);
    } catch {}
  };
  let completion;
  const stop = async signal => {
    if (stopped || settled) return completion;
    stopped = true;
    terminate(signal || 'SIGTERM');
    let timeoutId;
    const timeout = new Promise(resolve => {
      timeoutId = setTimeout(() => resolve(true), 5000);
      timeoutId.unref?.();
    });
    const timedOut = await Promise.race([
      completion.then(() => false, () => false),
      timeout,
    ]);
    clearTimeout(timeoutId);
    if (timedOut && !settled) {
      terminate('SIGKILL');
      await completion.catch(() => {});
    }
  };
  const signals = ['SIGINT', 'SIGTERM'];
  const handlers = new Map(signals.map(signal => [signal, () => void stop(signal)]));
  for (const [signal, handler] of handlers) process.once(signal, handler);
  const cleanup = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
  completion = new Promise((resolve, reject) => {
    child.once('error', error => {
      settled = true;
      cleanup();
      reject(error);
    });
    child.once('close', (code, signal) => {
      settled = true;
      cleanup();
      resolve(signal ? 1 : code == null ? 1 : code);
    });
  });
  return { child, completion, stop };
}

function runRstestProcess(options) {
  return startRstestProcess(options).completion;
}

module.exports = {
  buildRstestArgs,
  collectCompatibilityFiles,
  configureRstestRuntimeMetadata,
  initializeRstestBuildPlugins,
  inspectAppRstestCapability,
  resolveRstestBin,
  runRstestProcess,
  scanNativeRstestRoots,
  selectRstestInventory,
  selectRstestLanes,
  startRstestProcess,
};
