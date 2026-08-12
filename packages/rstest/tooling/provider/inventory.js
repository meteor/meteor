const fs = require('node:fs');
const path = require('node:path');

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
  const matches = filename => RSTEST_FILE.test(filename) ||
    fullApp && APP_TEST_FILE.test(filename);
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
      else if (entry.isFile() && matches(entry.name)) files.push(filePath);
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

function scanRstestCandidates(appDir, { fullApp = false } = {}) {
  const matches = filename => RSTEST_FILE.test(filename) ||
    fullApp && APP_TEST_FILE.test(filename);
  const candidateFiles = [];
  const legacyRootFiles = [];
  const legacyRoot = path.join(appDir, 'tests', 'legacy') + path.sep;
  const visit = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && (
        COMPATIBILITY_IGNORED_DIRS.has(entry.name) ||
        entry.name.startsWith('build-assets') ||
        entry.name.startsWith('build-chunks')
      )) continue;
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile() && matches(entry.name)) {
        if (filePath.startsWith(legacyRoot)) legacyRootFiles.push(filePath);
        else candidateFiles.push(filePath);
      }
    }
  };
  visit(appDir);
  return {
    candidateFiles: [...new Set(candidateFiles)].sort(),
    legacyRootFiles: [...new Set(legacyRootFiles)].sort(),
  };
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

module.exports = {
  collectCompatibilityFiles,
  inspectAppRstestCapability,
  scanRstestCandidates,
  scanNativeRstestRoots,
  selectRstestInventory,
  selectRstestLanes,
};
