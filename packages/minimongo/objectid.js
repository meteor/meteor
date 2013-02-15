

(function () {


LocalCollection._looksLikeObjectID = function (str) {
  return str.length === 24 && str.match(/^[0-9a-f]*$/);
};

LocalCollection._ObjectID = function (hexString) {
  //random-based impl of Mongo ObjectID
  var self = this;
  if (hexString) {
    hexString = hexString.toLowerCase();
    if (!LocalCollection._looksLikeObjectID(hexString)) {
      throw new Error("Invalid hexadecimal string for creating an ObjectID");
    }
    // meant to work with _.isEqual(), which relies on structural equality
    self._str = hexString;
  } else {
    self._str = Random.hexString(24);
  }
};

LocalCollection._ObjectID.prototype.toString = function () {
  var self = this;
  return "ObjectID(\"" + self._str + "\")";
};

LocalCollection._ObjectID.prototype.equals = function (other) {
  var self = this;
  return other instanceof LocalCollection._ObjectID &&
    self.valueOf() === other.valueOf();
};

LocalCollection._ObjectID.prototype.clone = function () {
  var self = this;
  return new LocalCollection._ObjectID(self._str);
};

LocalCollection._ObjectID.prototype.typeName = function() {
  return "oid";
};

LocalCollection._ObjectID.prototype.getTimestamp = function() {
  var self = this;
  return parseInt(self._str.substr(0, 8), 16);
};

LocalCollection._ObjectID.prototype.valueOf =
    LocalCollection._ObjectID.prototype.toJSONValue =
    LocalCollection._ObjectID.prototype.toHexString =
    function () { return this._str; };

// Is this selector just shorthand for lookup by _id?
LocalCollection._selectorIsId = function (selector) {
  return (typeof selector === "string") ||
    (typeof selector === "number") ||
    selector instanceof LocalCollection._ObjectID;
};

// If this is a selector that matches at most one document, return that
// id. Otherwise returns undefined. Note that the selector may have other
// restrictions so it may not even match that document!
// We care about $in and $and since those are generated access-controlled
// update and remove.
LocalCollection._idMatchedBySelector = function (selector) {
  // Is the selector just an ID?
  if (LocalCollection._selectorIsId(selector))
    return selector;
  if (!selector)
    return undefined;

  // Do we have an _id clause?
  if (_.has(selector, '_id')) {
    // Is the _id clause just an ID?
    if (LocalCollection._selectorIsId(selector._id))
      return selector._id;
    // Is the _id clause {_id: {$in: [oneId]}}?
    if (selector._id && selector._id.$in
        && _.isArray(selector._id.$in) && selector._id.$in.length === 1
        && LocalCollection._selectorIsId(selector._id.$in[0])) {
      return selector._id.$in[0];
    }
    return undefined;
  }

  // If this is a top-level $and, and any of the clauses can match at most one
  // document, then the whole selector can match at most that document.
  if (selector.$and && _.isArray(selector.$and)) {
    for (var i = 0; i < selector.$and.length; ++i) {
      var subId = LocalCollection._idMatchedBySelector(selector.$and[i]);
      if (subId !== undefined)
        return subId;
    }
  }

  return undefined;
};

EJSON.addType("oid",  function (str) {
  return new LocalCollection._ObjectID(str);
});

})();
