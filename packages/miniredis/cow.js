// A copy-on-write IdMap
// Avoids
CowIdMap = function (original) {
  var self = this;

  self._original = original;
  self._changes = new IdMap(original._idStringify, original._idParse);

  // XXX Should we maintain a combined list (of references, not deep-copies),
  // to avoid double-lookup?  Probably, because we always call flatten...
  //self._combined = new IdMap(original._idStringify, original._idParse);
};

var TOMBSTONE = {};

CowIdMap.prototype.remove = function (key) {
  var self = this;

  self._changes.put(key, TOMBSTONE);
};

CowIdMap.prototype.has = function (key) {
  var self = this;

  var v = self._changes.get(key);
  if (v === undefined) {
    return self._original.has(key);
  } else if (v === TOMBSTONE) {
    return false;
  } else {
    return true;
  }
};

CowIdMap.prototype.get = function (key) {
  var self = this;

  var v = self._changes.get(key);
  if (v === undefined) {
    return self._original.get(key);
  } else if (v === TOMBSTONE) {
    return undefined;
  } else {
    return v;
  }
};

CowIdMap.prototype.set = function (key, value) {
  var self = this;

  self._changes.set(key, value);
};


CowIdMap.prototype.forEach = function (iterator) {
  var self = this;

  var breakIfFalse = undefined;

  self._changes.forEach(function (value, id) {
    if (value === TOMBSTONE) {
      return true;
    }
    breakIfFalse = iterator.call(null, value, id);
    return breakIfFalse;
  });

  if (breakIfFalse === false) {
    return;
  }

  self._original.forEach(function (value, id) {
    if (self._changes.has(id)) {
      return true;
    }
    return iterator.call(null, value, id);
  });
};

CowIdMap.prototype._diffQueryChanges = function (callback) {
  var self = this;

  self._changes.forEach(function (value, id) {
    var oldValue = self._original.get(id);

    if (value === TOMBSTONE) {
//      obs['removed'] && obs['removed']({ _id: id, value: oldValue });
      callback(id, 'removed', value);
    } else if (oldValue === undefined) {
//      obs['added'] && obs['added']({ _id: id, value: value });
      callback(id, 'added', value);
    } else {
//      obs['changed'] && obs['changed']({ _id: key, value: value },
//                                       { _id: key, value: oldValue });
      callback(id, 'changed', value, oldValue);
    }

    return true;
  });
};

CowIdMap.prototype._flatten = function () {
  var self = this;
  var original = self._original;

  var flat = new IdMap(original._idStringify, original._idParse);

  self._original.forEach(function (value, id) {
    flat.set(id, value);
  });

  self._changes.forEach(function (value, id) {
    if (value === TOMBSTONE) {
      flat.remove(id);
    } else {
      flat.set(id, value);
    }
  });

  return flat;
};
