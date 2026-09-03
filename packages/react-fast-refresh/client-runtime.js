const runtime = require('react-refresh/runtime');

let timeout;
function scheduleRefresh() {
  timeout ??= setTimeout(() => {
    timeout = null;
    runtime.performReactRefresh();
  }, 0);
}

// The react refresh babel plugin only registers functions. For react
// to update other types of exports (such as classes), we have to
// register them
function registerExportsForReactRefresh(moduleId, moduleExports) {
  runtime.register(moduleExports, `${moduleId} %exports%`);
  if (moduleExports == null || typeof moduleExports !== 'object') return;

  for (const key of Object.keys(moduleExports)) {
    if (!Object.getOwnPropertyDescriptor(moduleExports, key)?.get) {
      runtime.register(moduleExports[key], `${moduleId} %exports% ${key}`);
    }
  }
}

// Modules that only export components become React Refresh boundaries.
// DOM elements are excluded to avoid triggering deprecated getter warnings.
function isReactRefreshBoundary(moduleExports) {
  if (runtime.isLikelyComponentType(moduleExports)) return true;
  if (moduleExports == null || typeof moduleExports !== 'object' || moduleExports instanceof Element) {
    return false;
  }

  const keys = Object.keys(moduleExports);
  if (keys.length === 0) return false;

  return keys.every(key => {
    // Don't invoke getters as they may have side effects
    if (Object.getOwnPropertyDescriptor(moduleExports, key)?.get) return false;
    try {
      return runtime.isLikelyComponentType(moduleExports[key]);
    } catch (e) {
      if (e.name === 'SecurityError') return false;
      throw e;
    }
  });
}

runtime.injectIntoGlobalHook(window);

window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;

const moduleInitialState = new WeakMap();

module.hot.onRequire({
  after(module) {
    const beforeState = moduleInitialState.get(module)?.pop();
    if (!beforeState) return;

    window.$RefreshReg$ = beforeState.prevRefreshReg;
    window.$RefreshSig$ = beforeState.prevRefreshSig;
    if (isReactRefreshBoundary(module.exports)) {
      registerExportsForReactRefresh(module.id, module.exports);
      module.hot.accept();
      scheduleRefresh();
    }
  }
});

module.exports = function setupModule(module) {
  if (module.loaded) return;

  if (!moduleInitialState.has(module)) {
    moduleInitialState.set(module, []);
  }

  moduleInitialState.get(module).push({
    prevRefreshReg: window.$RefreshReg$,
    prevRefreshSig: window.$RefreshSig$
  });

  window.$RefreshReg$ = (type, _id) => {
    runtime.register(type, `${module.id} ${_id}`);
  };
  window.$RefreshSig$ = runtime.createSignatureFunctionForTransform;
};
