/**
 * Local-collection cache for FederatedCollection (mirrors
 * mongo/local_collection_driver.js without depending on mongo).
 *
 * Keys are namespaced by provider so two collections with the same name
 * but different server-side providers cannot share client-side Minimongo
 * state. `openLocalCollection` returns the cached LocalCollection for a
 * (providerName, name) key, creating it on first use.
 *
 * `forgetLocalCollection` removes a single entry (used by
 * `collection.destroy()` / `dropCollectionAsync()`).
 *
 * `_resetAllForTests` wipes the process-global cache and is wired into
 * `Registry._resetForTests` so tests cannot inherit Minimongo state from
 * a prior run.
 */

const _afsLocalCollections = Object.create(null);

export function localKey(providerName, name) {
  return `${providerName || 'default'}:${name}`;
}

export function openLocalCollection(providerName, name, conn) {
  if (!name) {
    return new LocalCollection();
  }

  const key = localKey(providerName, name);

  if (!conn) {
    if (!(key in _afsLocalCollections)) {
      _afsLocalCollections[key] = new LocalCollection(name);
    }
    return _afsLocalCollections[key];
  }

  if (!conn._afs_collections) {
    conn._afs_collections = Object.create(null);
  }

  if (!(key in conn._afs_collections)) {
    conn._afs_collections[key] = new LocalCollection(name);
  }
  return conn._afs_collections[key];
}

export function forgetLocalCollection(providerName, name) {
  if (!name) return;
  const key = localKey(providerName, name);
  if (_afsLocalCollections[key]) {
    delete _afsLocalCollections[key];
  }
}

/** Test-only. Clears the process-global LocalCollection cache. */
export function _resetAllForTests() {
  for (const key of Object.keys(_afsLocalCollections)) {
    delete _afsLocalCollections[key];
  }
}
