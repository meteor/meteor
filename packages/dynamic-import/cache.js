var dbPromise;

var canUseCache =
  // The server doesn't benefit from dynamic module fetching, and almost
  // certainly doesn't support IndexedDB.
  Meteor.isClient &&
  // Cordova bundles all modules into the monolithic initial bundle, so
  // the dynamic module cache won't be necessary.
  ! Meteor.isCordova &&
  // Caching can be confusing in development, and is designed to be a
  // transparent optimization for production performance.
  Meteor.isProduction;

function getIDB() {
  if (typeof indexedDB !== "undefined") return indexedDB;
  if (typeof webkitIndexedDB !== "undefined") return webkitIndexedDB;
  if (typeof mozIndexedDB !== "undefined") return mozIndexedDB;
  if (typeof OIndexedDB !== "undefined") return OIndexedDB;
  if (typeof msIndexedDB !== "undefined") return msIndexedDB;
}

function withDB(callback) {
  dbPromise = dbPromise || new Promise(function (resolve, reject) {
    var idb = getIDB();
    if (! idb) {
      throw new Error("IndexedDB not available");
    }

    // Incrementing the version number causes all existing object stores
    // to be deleted and recreates those specified by objectStoreMap.
    var request = idb.open("MeteorDynamicImportCache", 2);

    request.onupgradeneeded = function (event) {
      var db = event.target.result;

      // It's fine to delete existing object stores since onupgradeneeded
      // is only called when we change the DB version number, and the data
      // we're storing is disposable/reconstructible.
      Array.from(db.objectStoreNames).forEach(db.deleteObjectStore, db);

      Object.keys(objectStoreMap).forEach(function (name) {
        db.createObjectStore(name, objectStoreMap[name]);
      });
    };

    request.onerror = makeOnError(reject, "indexedDB.open");
    request.onsuccess = function (event) {
      resolve(event.target.result);
    };
  });

  return dbPromise.then(callback, function (error) {
    return callback(null);
  });
}

var objectStoreMap = {
  sourcesByVersion: { keyPath: "version" }
};

function makeOnError(reject, source) {
  return function (event) {
    reject(new Error(
      "IndexedDB failure in " + source + " " +
        JSON.stringify(event.target)
    ));

    // Returning true from an onerror callback function prevents an
    // InvalidStateError in Firefox during Private Browsing. Silencing
    // that error is safe because we handle the error more gracefully by
    // passing it to the Promise reject function above.
    // https://github.com/meteor/meteor/issues/8697
    return true;
  };
}

var checkCount = 0;

exports.checkMany = function (versions) {
  var ids = Object.keys(versions);
  var sourcesById = Object.create(null);

  // Initialize sourcesById with null values to indicate all sources are
  // missing (unless replaced with actual sources below).
  ids.forEach(function (id) {
    sourcesById[id] = null;
  });

  if (! canUseCache) {
    return Promise.resolve(sourcesById);
  }

  return withDB(function (db) {
    if (! db) {
      // We thought we could used IndexedDB, but something went wrong
      // while opening the database, so err on the side of safety.
      return sourcesById;
    }

    var txn = db.transaction([
      "sourcesByVersion"
    ], "readonly");

    var sourcesByVersion = txn.objectStore("sourcesByVersion");

    ++checkCount;

    function finish() {
      --checkCount;
      return sourcesById;
    }

    return Promise.all(ids.map(function (id) {
      return new Promise(function (resolve, reject) {
        var version = versions[id];
        if (version) {
          var sourceRequest = sourcesByVersion.get(version);
          sourceRequest.onerror = makeOnError(reject, "sourcesByVersion.get");
          sourceRequest.onsuccess = function (event) {
            var result = event.target.result;
            if (result) {
              sourcesById[id] = result.source;
            }
            resolve();
          };
        } else resolve();
      });
    })).then(finish, finish);
  });
};

var pendingVersionsAndSourcesById = Object.create(null);

exports.setMany = function (versionsAndSourcesById) {
  if (canUseCache) {
    Object.assign(
      pendingVersionsAndSourcesById,
      versionsAndSourcesById
    );

    // Delay the call to flushSetMany so that it doesn't contribute to the
    // amount of time it takes to call module.dynamicImport.
    if (! flushSetMany.timer) {
      flushSetMany.timer = setTimeout(flushSetMany, 100);
    }
  }
};

function flushSetMany() {
  if (checkCount > 0) {
    // If checkMany is currently underway, postpone the flush until later,
    // since updating the cache is less important than reading from it.
    return flushSetMany.timer = setTimeout(flushSetMany, 100);
  }

  flushSetMany.timer = null;

  var versionsAndSourcesById = pendingVersionsAndSourcesById;
  pendingVersionsAndSourcesById = Object.create(null);

  return withDB(function (db) {
    if (! db) {
      // We thought we could used IndexedDB, but something went wrong
      // while opening the database, so err on the side of safety.
      return;
    }

    var setTxn = db.transaction([
      "sourcesByVersion"
    ], "readwrite");

    var sourcesByVersion = setTxn.objectStore("sourcesByVersion");

    return Promise.all(
      Object.keys(versionsAndSourcesById).map(function (id) {
        var info = versionsAndSourcesById[id];
        return new Promise(function (resolve, reject) {
          var request = sourcesByVersion.put({
            version: info.version,
            source: info.source
          });
          request.onerror = makeOnError(reject, "sourcesByVersion.put");
          request.onsuccess = resolve;
        });
      })
    );
  });
}
