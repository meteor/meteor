/**
 * Client entry that runs before the app. When a lazily loaded chunk cannot be
 * fetched, the page usually belongs to a build that a newer deploy replaced, so
 * the page reloads once to start the current build. The error still reaches the
 * app, and a second failure within the cooldown leaves the app to handle it.
 */
const STORAGE_KEY = 'meteor-rspack:chunk-load-reload-at';
const COOLDOWN_MS = 5 * 60 * 1000;
const CHUNK_LOAD_MESSAGE = /^Loading (CSS )?chunk \S+ failed/;

function isChunkLoadError(error) {
  return (
    !!error &&
    (error.name === 'ChunkLoadError' ||
      CHUNK_LOAD_MESSAGE.test(String(error.message)))
  );
}

// Without working storage the cooldown cannot be kept, so no reload happens.
function claimReload(now) {
  try {
    const storage = window.sessionStorage;
    const last = Number(storage.getItem(STORAGE_KEY));
    if (last > 0 && now - last < COOLDOWN_MS) {
      return false;
    }
    storage.setItem(STORAGE_KEY, String(now));
    return storage.getItem(STORAGE_KEY) === String(now);
  } catch (e) {
    return false;
  }
}

function reloadForChunkLoadError(error) {
  if (isChunkLoadError(error) && claimReload(Date.now())) {
    // location.reload() asks the server for the page again. Reload._reload()
    // uses location.replace(), which can restore the cached page of the old build.
    setTimeout(function () {
      window.location.reload();
    });
  }
}

// The loaders in __webpack_require__.f are shared by every module, also under
// hot module replacement, which gives each module its own __webpack_require__.e.
const chunkLoaders =
  typeof window !== 'undefined' &&
  typeof __webpack_require__ !== 'undefined' &&
  __webpack_require__.f;

if (chunkLoaders) {
  Object.keys(chunkLoaders).forEach(function (key) {
    const load = chunkLoaders[key];
    chunkLoaders[key] = function (chunkId, promises) {
      const before = promises.length;
      const result = load.apply(this, arguments);
      for (let i = before; i < promises.length; i++) {
        // A separate branch, so the rejection still reaches the app unchanged
        Promise.resolve(promises[i]).catch(reloadForChunkLoadError);
      }
      return result;
    };
  });
}
