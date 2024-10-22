import clone from 'lodash.clone'

/** @type {import('mongodb')} */
export const MongoDB = NpmModuleMongodb;

// The write methods block until the database has confirmed the write (it may
// not be replicated or stable on disk, but one server has confirmed it) if no
// callback is provided. If a callback is provided, then they call the callback
// when the write is confirmed. They return nothing on success, and raise an
// exception on failure.
//
// After making a write (with insert, update, remove), observers are
// notified asynchronously. If you want to receive a callback once all
// of the observer notifications have landed for your write, do the
// writes inside a write fence (set DDPServer._CurrentWriteFence to a new
// _WriteFence, and then set a callback on the write fence.)
//
// Since our execution environment is single-threaded, this is
// well-defined -- a write "has been made" if it's returned, and an
// observer "has been notified" if its callback has returned.

export const writeCallback = function (write, refresh, callback) {
  return function (err, result) {
    if (! err) {
      // XXX We don't have to run this on error, right?
      try {
        refresh();
      } catch (refreshErr) {
        if (callback) {
          callback(refreshErr);
          return;
        } else {
          throw refreshErr;
        }
      }
    }
    write.committed();
    if (callback) {
      callback(err, result);
    } else if (err) {
      throw err;
    }
  };
};


export const transformResult = function (driverResult) {
  var meteorResult = { numberAffected: 0 };
  if (driverResult) {
    var mongoResult = driverResult.result;
    // On updates with upsert:true, the inserted values come as a list of
    // upserted values -- even with options.multi, when the upsert does insert,
    // it only inserts one element.
    if (mongoResult.upsertedCount) {
      meteorResult.numberAffected = mongoResult.upsertedCount;

      if (mongoResult.upsertedId) {
        meteorResult.insertedId = mongoResult.upsertedId;
      }
    } else {
      // n was used before Mongo 5.0, in Mongo 5.0 we are not receiving this n
      // field and so we are using modifiedCount instead
      meteorResult.numberAffected = mongoResult.n || mongoResult.matchedCount || mongoResult.modifiedCount;
    }
  }

  return meteorResult;
};

export const replaceMeteorAtomWithMongo = function (document) {
  if (EJSON.isBinary(document)) {
    // This does more copies than we'd like, but is necessary because
    // MongoDB.BSON only looks like it takes a Uint8Array (and doesn't actually
    // serialize it correctly).
    return new MongoDB.Binary(Buffer.from(document));
  }
  if (document instanceof MongoDB.Binary) {
    return document;
  }
  if (document instanceof Mongo.ObjectID) {
    return new MongoDB.ObjectID(document.toHexString());
  }
  if (document instanceof MongoDB.Timestamp) {
    // For now, the Meteor representation of a Mongo timestamp type (not a date!
    // this is a weird internal thing used in the oplog!) is the same as the
    // Mongo representation. We need to do this explicitly or else we would do a
    // structural clone and lose the prototype.
    return document;
  }
  if (document instanceof Decimal) {
    return MongoDB.Decimal128.fromString(document.toString());
  }
  if (EJSON._isCustomType(document)) {
    return replaceNames(makeMongoLegal, EJSON.toJSONValue(document));
  }
  // It is not ordinarily possible to stick dollar-sign keys into mongo
  // so we don't bother checking for things that need escaping at this time.
  return undefined;
};

export const replaceTypes = function (document, atomTransformer) {
  if (typeof document !== 'object' || document === null)
    return document;

  var replacedTopLevelAtom = atomTransformer(document);
  if (replacedTopLevelAtom !== undefined)
    return replacedTopLevelAtom;

  var ret = document;
  Object.entries(document).forEach(function ([key, val]) {
    var valReplaced = replaceTypes(val, atomTransformer);
    if (val !== valReplaced) {
      // Lazy clone. Shallow copy.
      if (ret === document)
        ret = clone(document);
      ret[key] = valReplaced;
    }
  });
  return ret;
};

export const replaceMongoAtomWithMeteor = function (document) {
  if (document instanceof MongoDB.Binary) {
    // for backwards compatibility
    if (document.sub_type !== 0) {
      return document;
    }
    var buffer = document.value(true);
    return new Uint8Array(buffer);
  }
  if (document instanceof MongoDB.ObjectID) {
    return new Mongo.ObjectID(document.toHexString());
  }
  if (document instanceof MongoDB.Decimal128) {
    return Decimal(document.toString());
  }
  if (document["EJSON$type"] && document["EJSON$value"] && Object.keys(document).length === 2) {
    return EJSON.fromJSONValue(replaceNames(unmakeMongoLegal, document));
  }
  if (document instanceof MongoDB.Timestamp) {
    // For now, the Meteor representation of a Mongo timestamp type (not a date!
    // this is a weird internal thing used in the oplog!) is the same as the
    // Mongo representation. We need to do this explicitly or else we would do a
    // structural clone and lose the prototype.
    return document;
  }
  return undefined;
};

const makeMongoLegal = name => "EJSON" + name;
const unmakeMongoLegal = name => name.substr(5);