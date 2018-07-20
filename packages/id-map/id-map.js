const hasOwn = Object.prototype.hasOwnProperty;

export class IdMap {
  constructor(idStringify, idParse) {
    this._map = new Map();
    this._idStringify = idStringify || JSON.stringify;
    this._idParse = idParse || JSON.parse;
  }

// Some of these methods are designed to match methods on OrderedDict, since
// (eg) ObserveMultiplex and _CachingChangeObserver use them interchangeably.
// (Conceivably, this should be replaced with "UnorderedDict" with a specific
// set of methods that overlap between the two.)

  get(id) {
    var key = this._idStringify(id);
    return this._map.get(key);
  }

  set(id, value) {
    var key = this._idStringify(id);
    this._map.set(key, value);
  }

  remove(id) {
    var key = this._idStringify(id);
    this._map.delete(key);
  }

  has(id) {
    var key = this._idStringify(id);
    return this._map.has(key);
  }

  empty() {
    return this._map.size === 0;
  }

  clear() {
    this._map.clear();
  }

  // Iterates over the items in the map. Return `false` to break the loop.
  forEach(iterator) {
    // don't use _.each, because we can't break out of it.
    for (const [key, value] of this._map){
      var breakIfFalse = iterator.call(
        null,
        value,
        this._idParse(key)
      );
      if (breakIfFalse === false) {
        return;
      }
    }
  }

  size() {
    return this._map.size;
  }

  setDefault(id, def) {
    var key = this._idStringify(id);
    if (this._map.has(key)) {
      return this._map.get(key);
    }
    this._map.set(key, def);
    return def;
  }

  // Assumes that values are EJSON-cloneable, and that we don't need to clone
  // IDs (ie, that nobody is going to mutate an ObjectId).
  clone() {
    var clone = new IdMap(this._idStringify, this._idParse);
    // copy directly to avoid stringify/parse overhead
    this._map.forEach(function(value, key){
      clone._map.set(key, EJSON.clone(value));
    });
    return clone;
  }
}
