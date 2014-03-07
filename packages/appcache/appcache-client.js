if (window.applicationCache) {

var appCacheStatuses = [
  'uncached',
  'idle',
  'checking',
  'downloading',
  'updateready',
  'obsolete'
];

var updatingAppcache = false;
var reloadRetry = null;
var appcacheUpdated = false;

Reload._onMigrate('appcache', function(retry) {
  if (appcacheUpdated)
    return [true];

  // An uncached application (one that does not have a manifest) cannot
  // be updated.
  if (window.applicationCache.status === window.applicationCache.UNCACHED)
    return [true];

  if (!updatingAppcache) {
    try {
      window.applicationCache.update();
    } catch (e) {
      Meteor._debug('applicationCache update error', e);
      // There's no point in delaying the reload if we can't update the cache.
      return [true];
    }
    updatingAppcache = true;
  }

  // Delay migration until the app cache has been updated.
  reloadRetry = retry;
  return false;
});

// If we're migrating and the app cache is now up to date, signal that
// we're now ready to migrate.
var cacheIsNowUpToDate = function() {
  if (!updatingAppcache)
    return;
  appcacheUpdated = true;
  reloadRetry();
};

window.applicationCache.addEventListener('updateready', cacheIsNowUpToDate, false);
window.applicationCache.addEventListener('noupdate', cacheIsNowUpToDate, false);

// We'll get the obsolete event on a 404 fetching the app.manifest:
// we had previously been running with an app cache, but the app
// cache has now been disabled or the appcache package removed.
// Reload to get the new non-cached code.

window.applicationCache.addEventListener('obsolete', (function() {
  if (reloadRetry) {
    cacheIsNowUpToDate();
  } else {
    appcacheUpdated = true;
    Reload._reload();
  }
}), false);

} // if window.applicationCache
