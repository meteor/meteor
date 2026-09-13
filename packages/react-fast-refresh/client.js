const enabled = __meteor_runtime_config__?.reactFastRefreshEnabled;
const hmrEnabled = !!module.hot;
let setupModule;

function init(module) {
  if (!hmrEnabled) {
    return;
  }

  setupModule ??= require('./client-runtime.js');
  setupModule(module);
}

if (hmrEnabled && enabled) {
  let inBefore = false;
  module.hot.onRequire({
    before(module) {
      if (inBefore) {
        // This is a module required while loading the react refresh runtime
        // Do not initialize it to avoid an infinite loop
        return;
      }

      inBefore = true;
      init(module);
      inBefore = false;
    }
  });

  window.___INIT_METEOR_FAST_REFRESH = () => {};
} else {
  window.___INIT_METEOR_FAST_REFRESH = init;
}
