(function() {

  if (window.applicationCache == null)
    return;

  var appCacheStatuses = [
    'uncached',
    'idle',
    'checking',
    'downloading',
    'updateready',
    'obsolete'
  ];

  var updating_appcache = false;
  var reload_retry = null;
  var appcache_updated = false;

  Meteor._reload.onMigrate('appcache', function(retry) {
    if (appcache_updated)
      return [true];

    // An uncached application (one that does not have a manifest) cannot
    // be updated.
    if (window.applicationCache.status === window.applicationCache.UNCACHED)
      return [true];

    if (!updating_appcache) {
      try {
        window.applicationCache.update();
      } catch (e) {
        Meteor._debug('applicationCache update error', e);
        // There's no point in delaying the reload if we can't update the cache.
        return [true];
      }
      updating_appcache = true;
    }

    // Delay migration until the app cache has been updated.
    reload_retry = retry;
    return false;
  });

  // If we're migrating and the app cache is now up to date, signal that
  // we're now ready to migrate.
  var cacheIsNowUpToDate = function() {
    if (!updating_appcache)
      return;
    appcache_updated = true;
    return reload_retry();
  };

  window.applicationCache.addEventListener('updateready', cacheIsNowUpToDate, false);
  window.applicationCache.addEventListener('noupdate', cacheIsNowUpToDate, false);

  // We'll get the obsolete event on a 404 fetching the app.manifest:
  // we had previously been running with an app cache, but the app
  // cache has now been disabled or the appcache package removed.
  // Reload immediately to get the new non-cached code.

  window.applicationCache.addEventListener('obsolete', (function() {
    return window.location.reload();
  }), false);

})();
