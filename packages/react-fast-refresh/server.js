let enabled = !process.env.DISABLE_REACT_FAST_REFRESH;

if (enabled) {
  try {
    // React fast refresh requires react 16.9.0 or newer
    const semverGte = require('semver/functions/gte');
    const pkg = require('react/package.json');

    enabled = pkg && pkg.version &&
      semverGte(pkg.version, '16.9.0');
  } catch (e) {
    // If the app doesn't directly depend on react, leave react-refresh
    // enabled in case a package or indirect dependency uses react.
  }
}

// Needed for compatibility when build plugins use ReactFastRefresh.babelPlugin
if (typeof __meteor_runtime_config__ === 'object') {
  __meteor_runtime_config__.reactFastRefreshEnabled = enabled;
}

const babelPlugin = enabled ?
  require('react-refresh/babel') :
  null;

// Babel plugin that adds a call to global.___INIT_METEOR_FAST_REFRESH()
// at the start of every file compiled with react-refresh to ensure the runtime
// is enabled if it is used.
function enableReactRefreshBabelPlugin(babel) {
  const { types: t } = babel;

  return {
    name: "meteor-enable-react-fast-refresh",
    post(state) {
      // This is the path for the Program node
      let path = state.path;
      let method = t.identifier("___INIT_METEOR_FAST_REFRESH");
      let call = t.callExpression(
        method,
        [t.identifier("module")]
      );
      path.unshiftContainer("body", t.expressionStatement(call));
    },
  };
}

let deprecationWarned = false;

ReactFastRefresh = {
  get babelPlugin() {
    if (!deprecationWarned) {
      console.warn(
        'ReactFastRefresh.babelPlugin is deprecated and is incompatible with HMR on Cordova. Use ReactFastRefresh.getBabelPluginConfig() instead.'
      );
      deprecationWarned = true;
    }

    return babelPlugin;
  },
  getBabelPluginConfig() {
    if (!babelPlugin) {
      return [];
    }

    return [
      [babelPlugin, { skipEnvCheck: true }],
      enableReactRefreshBabelPlugin,
    ]
  }
};
