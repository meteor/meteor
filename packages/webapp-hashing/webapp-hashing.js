var crypto = Npm.require("crypto");

WebAppHashing = {};

// Calculate a hash of all the client resources downloaded by the
// browser, including the application HTML, runtime config, code, and
// static files.
//
// This hash *must* change if any resources seen by the browser
// change, and ideally *doesn't* change for any server-only changes
// (but the second is a performance enhancement, not a hard
// requirement).

WebAppHashing.calculateClientHash =
  function (manifest, includeFilter, runtimeConfigOverride) {
  var hash = crypto.createHash('sha1');

  // Omit the old hashed client values in the new hash. These may be
  // modified in the new boilerplate.
  var runtimeCfg = _.omit(__meteor_runtime_config__,
    ['autoupdateVersion', 'autoupdateVersionRefreshable',
     'autoupdateVersionCordova']);

  if (runtimeConfigOverride) {
    runtimeCfg = runtimeConfigOverride;
  }

  hash.update(JSON.stringify(runtimeCfg, 'utf8'));

  _.each(manifest, function (resource) {
      if ((! includeFilter || includeFilter(resource.type)) &&
          (resource.where === 'client' || resource.where === 'internal')) {
      hash.update(resource.path);
      hash.update(resource.hash);
    }
  });
  return hash.digest('hex');
};

WebAppHashing.calculateCordovaCompatibilityHash =
  function(platformVersion, pluginVersions) {
  const hash = crypto.createHash('sha1');

  hash.update(platformVersion);

  // Sort plugins first so iteration order doesn't affect the hash
  const plugins = Object.keys(pluginVersions).sort();
  for (let plugin of plugins) {
    const version = pluginVersions[plugin];
    hash.update(plugin);
    hash.update(version);
  }

  return hash.digest('hex');
};
