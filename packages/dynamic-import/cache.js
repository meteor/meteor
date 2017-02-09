var PREFIX = "dynamic-import:";
var ID_PREFIX = PREFIX + "id:";
var VERSION_PREFIX = PREFIX + "version:";
var RESOLVED = Promise.resolve();
var MISSING_ERROR = new Error("version not found");
var MISSING = Promise.reject(MISSING_ERROR);
// Silence uncaught rejection warnings.
MISSING.catch(function(){});
var pendingClean = null;

function getItem(key) {
  var value = Meteor._localStorage.getItem(key);
  return typeof value === "string"
    ? Promise.resolve(value)
    : MISSING;
}

function setItem(key, value) {
  Meteor._localStorage.setItem(key, value);
}

function clean() {
  clearTimeout(pendingClean);
  pendingClean = null;

  var activeVersions = Object.create(null);
  var allVersions = Object.create(null);

  Object.keys(Meteor._localStorage).forEach(function (key) {
    if (key.startsWith(ID_PREFIX)) {
      activeVersions[Meteor._localStorage.getItem(key)] = true;
    } else if (key.startsWith(VERSION_PREFIX)) {
      var version = key.slice(VERSION_PREFIX.length);
      allVersions[version] = key;
    }
  });

  Object.keys(allVersions).forEach(function (version) {
    if (activeVersions[version] !== true) {
      Meteor._localStorage.removeItem(allVersions[version]);
    }
  });
}

exports.check = function check(id, currentVersion) {
  if (! Meteor.isProduction) {
    return MISSING;
  }

  return getItem(ID_PREFIX + id).then(function (previousVersion) {
    return currentVersion === previousVersion
      ? getItem(VERSION_PREFIX + previousVersion)
      : MISSING;
  });
};

exports.set = function set(id, version, value) {
  if (! Meteor.isProduction) {
    return RESOLVED;
  }

  if (! pendingClean) {
    pendingClean = setTimeout(clean, 1000);
  }

  return Promise.all([
    setItem(VERSION_PREFIX + version, value),
    setItem(ID_PREFIX + id, version)
  ]);
};
