let enabled = __meteor_runtime_config__ &&
  __meteor_runtime_config__.reactFastRefreshEnabled;
let hmrEnabled = !!module.hot;
var setupModule;

function init(module) {
  if (!hmrEnabled) {
    return;
  }

  setupModule = setupModule || require('./client-runtime.js');
  setupModule(module);
}

if (
  hmrEnabled &&
  enabled
) {
  module.hot.onRequire({
    before(module) {
      init(module);
    }
  });

  window.___INIT_METEOR_FAST_REFRESH = function () {};
} else {
  window.___INIT_METEOR_FAST_REFRESH = init;
}
