var dbPromise;

function withDB(callback) {
  dbPromise = dbPromise || new Promise(function (resolve, reject) {
    var request = global.indexedDB.open("MeteorDynamicImportCache", 1);

    request.onupgradeneeded = function (event) {
      var db = event.target.result;
      db.createObjectStore("versionsById", { keyPath: "id" });
      db.createObjectStore("sourcesByVersion", { keyPath: "version" });
    };

    request.onerror = reject;
    request.onsuccess = function (event) {
      resolve(event.target.result);
    };
  });

  return dbPromise.then(callback);
}

var checkTxn;

exports.checkMany = function (versions) {
  var ids = Object.keys(versions);
  var sourcesById = Object.create(null);

  // Initialize sourcesById with null values to indicate all sources are
  // missing (unless replaced with actual sources below).
  ids.forEach(function (id) {
    sourcesById[id] = null;
  });

  if (! Meteor.isProduction) {
    return Promise.resolve(sourcesById);
  }

  return withDB(function (db) {
    checkTxn = checkTxn || db.transaction([
      "versionsById",
      "sourcesByVersion"
    ], "readonly");

    var versionsById = checkTxn.objectStore("versionsById");
    var sourcesByVersion = checkTxn.objectStore("sourcesByVersion");

    return Promise.all(ids.map(function (id) {
      return get(versionsById, id).then(function (result) {
        var previousVersion = result && result.version;
        if (previousVersion === versions[id]) {
          return get(
            sourcesByVersion,
            result.version
          ).then(function (result) {
            if (result) {
              sourcesById[id] = result.source;
            }
          });
        }
      });

    })).then(function () {
      checkTxn = null;
      return sourcesById;
    });
  });
};

function get(store, key) {
  return new Promise(function (resolve, reject) {
    var request = store.get(key);
    request.onerror = reject;
    request.onsuccess = function (event) {
      resolve(event.target.result);
    };
  });
}

var pendingVersionsAndSourcesById = Object.create(null);

exports.setMany = function (versionsAndSourcesById) {
  if (Meteor.isProduction) {
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
  if (checkTxn) {
    // If checkMany is currently underway, postpone the flush until later,
    // since updating the cache is less important than reading from it.
    return flushSetMany.timer = setTimeout(flushSetMany, 100);
  }

  flushSetMany.timer = null;

  var versionsAndSourcesById = pendingVersionsAndSourcesById;
  pendingVersionsAndSourcesById = Object.create(null);

  return withDB(function (db) {
    var setTxn = db.transaction([
      "versionsById",
      "sourcesByVersion"
    ], "readwrite");

    var versionsById = setTxn.objectStore("versionsById");
    var sourcesByVersion = setTxn.objectStore("sourcesByVersion");
    var promises = [];

    Object.keys(versionsAndSourcesById).forEach(function (id) {
      var info = versionsAndSourcesById[id];

      promises.push(put(versionsById, {
        id: id,
        version: info.version
      }));

      promises.push(put(sourcesByVersion, {
        version: info.version,
        source: info.source
      }));
    });

    return Promise.all(promises);
  });
}

function put(store, object) {
  return new Promise(function (resolve, reject) {
    var request = store.put(object);
    request.onerror = reject;
    request.onsuccess = resolve;
  });
}
