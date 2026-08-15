function assertTestPath(testPath) {
  const segments = typeof testPath === 'string' ? testPath.split('/') : [];
  if (
    typeof testPath !== 'string' ||
    testPath.length === 0 ||
    testPath.startsWith('/') ||
    testPath.includes('\\') ||
    testPath.includes('\0') ||
    segments.some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new TypeError(
      '[Meteor Rstest] Test path must be a safe app-relative POSIX path.',
    );
  }
}

function createFileLoaderRegistry() {
  const loaders = new Map();

  return {
    register(testPath, load) {
      assertTestPath(testPath);
      if (typeof load !== 'function') {
        throw new TypeError('[Meteor Rstest] Test file loader must be a function.');
      }
      if (loaders.has(testPath)) {
        throw new Error(
          `[Meteor Rstest] Test file is already registered: ${testPath}`,
        );
      }
      loaders.set(testPath, load);
    },

    take() {
      const entries = [...loaders]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([testPath, load]) => ({ testPath, load }));
      loaders.clear();
      return entries;
    },
  };
}

module.exports = {
  createFileLoaderRegistry,
};
