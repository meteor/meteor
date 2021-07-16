
let enabled = !process.env.DISABLE_REACT_FAST_REFRESH;

if (enabled) {
  try {
    // React fast refresh requires react 16.9.0 or newer
    const semver = require('semver');
    const pkg = require('react/package.json');

    enabled = pkg && pkg.version &&
      semver.gte(pkg.version, '16.9.0');
  } catch (e) {
    // If the app doesn't directly depend on react, leave react-refresh
    // enabled in case a package or indirect dependency uses react.
  }
}

if (typeof __meteor_runtime_config__ === 'object') {
  __meteor_runtime_config__.reactFastRefreshEnabled = enabled;
}

let babelPlugin = null;
if (enabled) {
  let originalPlugin = require('react-refresh/babel');
  let defaultOptions = { skipEnvCheck: true };

  babelPlugin = function (babel, options = defaultOptions) {
    return originalPlugin(babel, options);
  };
}

ReactFastRefresh = {
  babelPlugin,
};
