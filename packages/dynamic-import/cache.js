var PREFIX = "dynamic-import:";
var ID_PREFIX = PREFIX + "id:";
var VERSION_PREFIX = PREFIX + "version:";
var MISSING_ERROR = new Error("version not found");
var pendingClean = null;

function getItem(key) {
  var value = Meteor._localStorage.getItem(key);
  return typeof value === "string"
    ? Promise.resolve(value)
    : Promise.reject(MISSING_ERROR);
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
  return getItem(ID_PREFIX + id).then(function (previousVersion) {
    if (currentVersion === previousVersion) {
      return getItem(VERSION_PREFIX + previousVersion);
    }
    throw MISSING_ERROR;
  });
};

exports.set = function set(id, version, value) {
  if (! pendingClean) {
    pendingClean = setTimeout(clean, 1000);
  }

  return Promise.all([
    setItem(VERSION_PREFIX + version, value),
    setItem(ID_PREFIX + id, version)
  ]);
};
