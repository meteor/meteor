var enabled = __meteor_runtime_config__ &&
  __meteor_runtime_config__.reactFastRefreshEnabled;
var hmrEnabled = !!module.hot;
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
  var inBefore = false;
  module.hot.onRequire({
    before: function (module) {
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

  window.___INIT_METEOR_FAST_REFRESH = function () {};
} else {
  window.___INIT_METEOR_FAST_REFRESH = init;
}
