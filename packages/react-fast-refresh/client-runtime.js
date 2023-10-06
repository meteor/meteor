var runtime = require('react-refresh/runtime');

var timeout = null;
function scheduleRefresh() {
  if (!timeout) {
    timeout = setTimeout(function () {
      timeout = null;
      runtime.performReactRefresh();
    }, 0);
  }
}

// The react refresh babel plugin only registers functions. For react
// to update other types of exports (such as classes), we have to
// register them
function registerExportsForReactRefresh(moduleId, moduleExports) {
  runtime.register(moduleExports, moduleId + ' %exports%');

  if (moduleExports == null || typeof moduleExports !== 'object') {
    // Exit if we can't iterate over exports.
    return;
  }

  for (var key in moduleExports) {
    var desc = Object.getOwnPropertyDescriptor(moduleExports, key);
    if (desc && desc.get) {
      // Don't invoke getters as they may have side effects.
      continue;
    }

    var exportValue = moduleExports[key];
    var typeID = moduleId + ' %exports% ' + key;
    runtime.register(exportValue, typeID);
  }
}

// Modules that only export components become React Refresh boundaries.
function isReactRefreshBoundary(moduleExports) {
  if (runtime.isLikelyComponentType(moduleExports)) {
    return true;
  }
  if (moduleExports == null || typeof moduleExports !== 'object') {
    // Exit if we can't iterate over exports.
    return false;
  }

  // Is a DOM element. If we iterate its properties, we might cause the
  // browser to show warnings when accessing depreciated getters on its
  // prototype
  if (moduleExports instanceof Element) {
    return false;
  }

  var hasExports = false;
  var onlyExportComponents = true;

  for (var key in moduleExports) {
    hasExports = true;

    var desc = Object.getOwnPropertyDescriptor(moduleExports, key);
    if (desc && desc.get) {
      // Don't invoke getters as they may have side effects.
      return false;
    }

    try {
      if (!runtime.isLikelyComponentType(moduleExports[key])) {
        onlyExportComponents = false;
      }
    } catch (e) {
      if (e.name === 'SecurityError') {
        // Not a component. Could be a cross-origin object or something else
        // we don't have access to
        return false;
      }

      throw e;
    }
  }

  return hasExports && onlyExportComponents;
}

runtime.injectIntoGlobalHook(window);

window.$RefreshReg$ = function () { };
window.$RefreshSig$ = function () {
  return function (type) { return type; };
};

var moduleInitialState = new WeakMap();

module.hot.onRequire({
  after: function (module) {
    // TODO: handle modules with errors

    var beforeStates = moduleInitialState.get(module);
    var beforeState = beforeStates && beforeStates.pop();
    if (!beforeState) {
      return;
    }

    window.$RefreshReg$ = beforeState.prevRefreshReg;
    window.$RefreshSig$ = beforeState.prevRefreshSig;
    if (isReactRefreshBoundary(module.exports)) {
      registerExportsForReactRefresh(module.id, module.exports);
      module.hot.accept();

      scheduleRefresh();
    }
  }
});

module.exports = function setupModule (module) {
  if (module.loaded) {
    // The module was already executed
    return;
  }

  var beforeStates = moduleInitialState.get(module);

  if (beforeStates === undefined) {
    beforeStates = [];
    moduleInitialState.set(module, beforeStates);
  }

  var prevRefreshReg = window.$RefreshReg$;
  var prevRefreshSig = window.$RefreshSig$;

  window.RefreshRuntime = runtime;
  window.$RefreshReg$ = function (type, _id) {
    var fullId = module.id + ' ' + _id;
    RefreshRuntime.register(type, fullId);
  };
  window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;

  beforeStates.push({
    prevRefreshReg: prevRefreshReg,
    prevRefreshSig: prevRefreshSig
  });
};
