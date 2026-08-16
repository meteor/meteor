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
  const readinessWaiters = new Set();

  const isReady = () => Boolean(runtimeFactory) && loaders.size > 0;
  const resolveReadiness = () => {
    if (!isReady()) return;
    for (const waiter of readinessWaiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve();
    }
    readinessWaiters.clear();
  };

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
      resolveReadiness();
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
      // Rspack watch rebuilds evaluate a fresh bundle factory in same Meteor
      // process. Latest successful bundle must own subsequent file runtimes.
      runtimeFactory = factory;
      resolveReadiness();
    },

    getRuntimeFactory() {
      if (!runtimeFactory) {
        throw new Error('[Meteor Rstest] Upstream runtime factory was not registered.');
      }
      return runtimeFactory;
    },

    waitUntilReady({ timeoutMs = 600000 } = {}) {
      if (isReady()) return Promise.resolve();
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return Promise.reject(new TypeError(
          '[Meteor Rstest] Runtime bundle readiness timeout must be positive.',
        ));
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          timeout: setTimeout(() => {
            readinessWaiters.delete(waiter);
            reject(new Error(
              '[Meteor Rstest] Rspack runtime bundle did not register its factory and test files.',
            ));
          }, timeoutMs),
        };
        readinessWaiters.add(waiter);
        resolveReadiness();
      });
    },
  };
}

module.exports = {
  createFileLoaderRegistry,
};
