const fs = require('node:fs');
const path = require('node:path');
const picomatch = require('picomatch');

function pathError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

function slash(filename) {
  return filename.split(path.sep).join('/');
}

function contains(root, filename) {
  const relative = path.relative(root, filename);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function realpathIfPresent(filename) {
  try {
    return fs.realpathSync(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return path.resolve(filename);
    throw error;
  }
}

function normalizeRoots({ appRoot, localPackages = [] }) {
  if (typeof appRoot !== 'string' || !path.isAbsolute(appRoot)) {
    throw pathError(
      'METEOR_RSTEST_COVERAGE_ROOT_INVALID',
      'Coverage application root must be absolute.',
    );
  }
  const packages = new Map();
  for (const entry of localPackages) {
    if (!entry || typeof entry.name !== 'string' || !entry.name ||
        typeof entry.sourceRoot !== 'string' || !path.isAbsolute(entry.sourceRoot) ||
        packages.has(entry.name)) {
      throw pathError(
        'METEOR_RSTEST_COVERAGE_PACKAGE_INVALID',
        'Coverage local-package inventory contains an invalid or duplicate entry.',
      );
    }
    packages.set(entry.name, realpathIfPresent(entry.sourceRoot));
  }
  return {
    appRoot: realpathIfPresent(appRoot),
    packages,
  };
}

function resolvePackagePath(sourcePath, roots) {
  const normalized = sourcePath.replaceAll('\\', '/');
  let packageName;
  let relative;
  if (normalized.startsWith('packages/')) {
    const segments = normalized.slice('packages/'.length).split('/');
    packageName = segments.shift();
    relative = segments.join('/');
  } else if (normalized.startsWith('local-test:')) {
    const slashIndex = normalized.indexOf('/');
    packageName = slashIndex === -1 ? normalized : normalized.slice(0, slashIndex);
    relative = slashIndex === -1 ? '' : normalized.slice(slashIndex + 1);
  } else {
    return null;
  }
  const packageRoot = roots.packages.get(packageName);
  if (!packageRoot) {
    throw pathError(
      'METEOR_RSTEST_COVERAGE_PACKAGE_UNKNOWN',
      `Coverage path names an unknown local package: ${packageName}`,
    );
  }
  const resolved = realpathIfPresent(path.resolve(packageRoot, relative));
  if (!contains(packageRoot, resolved)) {
    throw pathError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      `Coverage path escapes local package ${packageName}.`,
    );
  }
  return resolved;
}

function canonicalizeCoveragePath(sourcePath, options) {
  if (typeof sourcePath !== 'string' || !sourcePath) {
    throw pathError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      'Coverage map contains an invalid source path.',
    );
  }
  const roots = options.packages instanceof Map ? options : normalizeRoots(options);
  const packagePath = resolvePackagePath(sourcePath, roots);
  if (packagePath) return packagePath;
  return realpathIfPresent(
    path.isAbsolute(sourcePath)
      ? sourcePath
      : path.resolve(roots.appRoot, sourcePath),
  );
}

function packageLogicalPaths(filename, roots) {
  const candidates = [];
  for (const [name, packageRoot] of roots.packages) {
    if (!contains(packageRoot, filename)) continue;
    const relative = slash(path.relative(packageRoot, filename));
    candidates.push(
      name.startsWith('local-test:')
        ? `${name}/${relative}`
        : `packages/${name}/${relative}`,
    );
  }
  return candidates;
}

function matchPatterns(filename, patterns, roots) {
  const candidates = [slash(filename), ...packageLogicalPaths(filename, roots)];
  if (contains(roots.appRoot, filename)) {
    candidates.push(slash(path.relative(roots.appRoot, filename)));
  }
  return patterns.some(pattern => {
    const matches = picomatch(pattern.replaceAll('\\', '/'), { dot: true });
    return candidates.some(candidate => matches(candidate));
  });
}

function isGeneratedOrTestFile(filename, roots) {
  const appRelative = contains(roots.appRoot, filename)
    ? slash(path.relative(roots.appRoot, filename))
    : '';
  const basename = path.basename(filename);
  return appRelative.startsWith('.meteor/local/') ||
    appRelative.startsWith('node_modules/.cache/') ||
    basename === 'rstest.generated.config.cjs' ||
    /\.(?:test|tests|spec|specs)\.[cm]?[jt]sx?$/.test(basename) ||
    /(?:^|\/)playwright-setup\.mjs$/.test(slash(filename));
}

function canonicalizeCoverageMaps(coverageMaps, {
  appRoot,
  localPackages = [],
  include = [],
  exclude = [],
  allowExternal = false,
}) {
  const roots = normalizeRoots({ appRoot, localPackages });
  const maps = [];
  const files = new Set();
  for (const coverage of coverageMaps) {
    if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
      throw pathError(
        'METEOR_RSTEST_COVERAGE_MAP_INVALID',
        'Coverage map must be an object.',
      );
    }
    const canonicalMap = {};
    for (const [sourcePath, fileCoverage] of Object.entries(coverage)) {
      if (!fileCoverage || typeof fileCoverage !== 'object' ||
          typeof fileCoverage.path !== 'string') {
        throw pathError(
          'METEOR_RSTEST_COVERAGE_MAP_INVALID',
          `Coverage entry ${JSON.stringify(sourcePath)} is invalid.`,
        );
      }
      const filename = canonicalizeCoveragePath(sourcePath, roots);
      const internalPath = canonicalizeCoveragePath(fileCoverage.path, roots);
      if (filename !== internalPath) {
        throw pathError(
          'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
          `Coverage key and internal path disagree for ${sourcePath}.`,
        );
      }
      const isLocalPackage = [...roots.packages.values()].some(packageRoot =>
        contains(packageRoot, filename)
      );
      if (!contains(roots.appRoot, filename) && !isLocalPackage && !allowExternal) {
        continue;
      }
      if (isGeneratedOrTestFile(filename, roots) ||
          include.length > 0 && !matchPatterns(filename, include, roots) ||
          exclude.length > 0 && matchPatterns(filename, exclude, roots)) {
        continue;
      }
      canonicalMap[filename] = { ...fileCoverage, path: filename };
      files.add(filename);
    }
    maps.push(canonicalMap);
  }
  return { maps, files: [...files].sort() };
}

module.exports = {
  canonicalizeCoverageMaps,
  canonicalizeCoveragePath,
};
