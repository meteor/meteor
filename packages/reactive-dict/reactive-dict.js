// XXX come up with a serialization method which canonicalizes object key
// order, which would allow us to use objects as values for equals.
function stringify(value) {
  if (value === undefined) {
    return 'undefined';
  }
  return EJSON.stringify(value);
}

function parse(serialized) {
  if (serialized === undefined || serialized === 'undefined') {
    return undefined;
  }
  return EJSON.parse(serialized);
}

function changed(v) {
  v && v.changed();
}

// XXX COMPAT WITH 0.9.1 : accept migrationData instead of dictName
export class ReactiveDict {
  constructor(dictName, dictData) {
    // this.keys: key -> value
    this.keys = {};

    if (dictName) {
      // name given; migration will be performed
      if (typeof dictName === 'string') {
        // the normal case, argument is a string name.

        // Only run migration logic on client, it will cause
        // duplicate name errors on server during reloads.
        // _registerDictForMigrate will throw an error on duplicate name.
        Meteor.isClient && ReactiveDict._registerDictForMigrate(dictName, this);
        const migratedData = Meteor.isClient && ReactiveDict._loadMigratedDict(dictName);

        if (migratedData) {
          // Don't stringify migrated data
          this.keys = migratedData;
        } else {
          // Use _setObject to make sure values are stringified
          this._setObject(dictData || {});
        }
        this.name = dictName;
      } else if (typeof dictName === 'object') {
        // back-compat case: dictName is actually migrationData
        // Use _setObject to make sure values are stringified
        this._setObject(dictName);
      } else {
        throw new Error("Invalid ReactiveDict argument: " + dictName);
      }
    } else if (typeof dictData === 'object') {
      this._setObject(dictData);
    }

    this.allDeps = new Tracker.Dependency;
    this.keyDeps = {}; // key -> Dependency
    this.keyValueDeps = {}; // key -> Dependency
  }

  // set() began as a key/value method, but we are now overloading it
  // to take an object of key/value pairs, similar to backbone
  // http://backbonejs.org/#Model-set
  set(keyOrObject, value) {
    if ((typeof keyOrObject === 'object') && (value === undefined)) {
      // Called as `dict.set({...})`
      this._setObject(keyOrObject);
      return;
    }
    // the input isn't an object, so it must be a key
    // and we resume with the rest of the function
    const key = keyOrObject;

    value = stringify(value);

    const keyExisted = _.has(this.keys, key);
    const oldSerializedValue = keyExisted ? this.keys[key] : 'undefined';
    const isNewValue = (value !== oldSerializedValue);

    this.keys[key] = value;

    if (isNewValue || !keyExisted) {
      // Using the changed utility function here because this.allDeps might not exist yet,
      // when setting initial data from constructor
      changed(this.allDeps);
    }

    // Don't trigger changes when setting initial data from constructor,
    // this.KeyDeps is undefined in this case
    if (isNewValue && this.keyDeps) {
      changed(this.keyDeps[key]);
      if (this.keyValueDeps[key]) {
        changed(this.keyValueDeps[key][oldSerializedValue]);
        changed(this.keyValueDeps[key][value]);
      }
    }
  }

  setDefault(keyOrObject, value) {
    if ((typeof keyOrObject === 'object') && (value === undefined)) {
      // Called as `dict.setDefault({...})`
      this._setDefaultObject(keyOrObject);
      return;
    }
    // the input isn't an object, so it must be a key
    // and we resume with the rest of the function
    const key = keyOrObject;

    if (! _.has(this.keys, key)) {
      this.set(key, value);
    }
  }

  get(key) {
    this._ensureKey(key);
    this.keyDeps[key].depend();
    return parse(this.keys[key]);
  }

  equals(key, value) {
    // Mongo.ObjectID is in the 'mongo' package
    let ObjectID = null;
    if (Package.mongo) {
      ObjectID = Package.mongo.Mongo.ObjectID;
    }
    // We don't allow objects (or arrays that might include objects) for
    // .equals, because JSON.stringify doesn't canonicalize object key
    // order. (We can make equals have the right return value by parsing the
    // current value and using EJSON.equals, but we won't have a canonical
    // element of keyValueDeps[key] to store the dependency.) You can still use
    // "EJSON.equals(reactiveDict.get(key), value)".
    //
    // XXX we could allow arrays as long as we recursively check that there
    // are no objects
    if (typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        typeof value !== 'undefined' &&
        !(value instanceof Date) &&
        !(ObjectID && value instanceof ObjectID) &&
        value !== null) {
      throw new Error("ReactiveDict.equals: value must be scalar");
    }
    const serializedValue = stringify(value);

    if (Tracker.active) {
      this._ensureKey(key);

      if (! _.has(this.keyValueDeps[key], serializedValue)) {
        this.keyValueDeps[key][serializedValue] = new Tracker.Dependency;
      }

      var isNew = this.keyValueDeps[key][serializedValue].depend();
      if (isNew) {
        Tracker.onInvalidate(() => {
          // clean up [key][serializedValue] if it's now empty, so we don't
          // use O(n) memory for n = values seen ever
          if (! this.keyValueDeps[key][serializedValue].hasDependents()) {
            delete this.keyValueDeps[key][serializedValue];
          }
        });
      }
    }

    let oldValue = undefined;
    if (_.has(this.keys, key)) {
      oldValue = parse(this.keys[key]);
    }
    return EJSON.equals(oldValue, value);
  }

  all() {
    this.allDeps.depend();
    let ret = {};
    _.each(this.keys, (value, key) => {
      ret[key] = parse(value);
    });
    return ret;
  }

  clear() {
    const oldKeys = this.keys;
    this.keys = {};

    this.allDeps.changed();

    _.each(oldKeys, (value, key) => {
      changed(this.keyDeps[key]);
      if (this.keyValueDeps[key]) {
        changed(this.keyValueDeps[key][value]);
        changed(this.keyValueDeps[key]['undefined']);
      }
    });
  }

  delete(key) {
    let didRemove = false;

    if (_.has(this.keys, key)) {
      const oldValue = this.keys[key];
      delete this.keys[key];
      changed(this.keyDeps[key]);
      if (this.keyValueDeps[key]) {
        changed(this.keyValueDeps[key][oldValue]);
        changed(this.keyValueDeps[key]['undefined']);
      }
      this.allDeps.changed();
      didRemove = true;
    }
    return didRemove;
  }
  
  destroy() {
    this.clear();
    if (this.name && _.has(ReactiveDict._dictsToMigrate, this.name)) {
      delete ReactiveDict._dictsToMigrate[this.name];
    }
  }

  _setObject(object) {
    _.each(object, (value, key) => {
      this.set(key, value);
    });
  }

  _setDefaultObject(object) {
    _.each(object, (value, key) => {
      this.setDefault(key, value);
    });
  }

  _ensureKey(key) {
    if (!(key in this.keyDeps)) {
      this.keyDeps[key] = new Tracker.Dependency;
      this.keyValueDeps[key] = {};
    }
  }

  // Get a JSON value that can be passed to the constructor to
  // create a new ReactiveDict with the same contents as this one
  _getMigrationData() {
    // XXX sanitize and make sure it's JSONible?
    return this.keys;
  }
}
