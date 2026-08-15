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
  let runtimeFactory;

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

    setRuntimeFactory(factory) {
      if (typeof factory !== 'function') {
        throw new TypeError('[Meteor Rstest] Runtime factory must be a function.');
      }
      if (runtimeFactory && runtimeFactory !== factory) {
        throw new Error('[Meteor Rstest] Upstream runtime factory is already registered.');
      }
      runtimeFactory = factory;
    },

    getRuntimeFactory() {
      if (!runtimeFactory) {
        throw new Error('[Meteor Rstest] Upstream runtime factory was not registered.');
      }
      return runtimeFactory;
    },
  };
}

module.exports = {
  createFileLoaderRegistry,
};
