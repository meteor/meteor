

(function () {

var ObjectID;
if (typeof Meteor === 'undefined' || Meteor.isClient) {
  ObjectID = LocalCollection._ObjectID;
} else {
  ObjectID = (function () {
    var ObjectID = __meteor_bootstrap__.require('mongodb').ObjectID;
    ObjectID.prototype.clone = function () { return new ObjectID(this.toHexString());};
    return ObjectID;
  })();
}

LocalCollection._idToDDP = function (id) {
  if (id instanceof ObjectID) {
    return id.valueOf();
  } else if (_.isString(id)) {
    if (id === "") {
      return id;
    } else if (id[0] === "-" || // escape previously dashed strings
               id[0] === "~" || // escape escaped numbers
               LocalCollection._isObjectID(id) || // escape object-id-form strings
               id[0] === '{') { // escape object-form strings, for maybe implementing later
      return "-" + id;
    } else {
      return id; // other strings go through unchanged.
    }
  } else if (_.isNumber(id)) {
    return '~' + id;
  } else if (id === undefined) {
    return '-';
  } else {
    throw new Error("Meteor's MongoDB does not yet handle ids other than strings and ObjectIDs " + typeof id);
  }
};

LocalCollection._idFromDDP = function (id) {
  if (id === "") {
    return id;
  } else if (id === '-') {
    return undefined;
  } else if (id[0] === '-') {
    return id.substr(1);
  } else if (id[0] === '~') {
    return parseFloat(id.substr(1));
  } else if (LocalCollection._isObjectID(id)) {
    return new ObjectID(id);
  } else {
    return id;
  }
};

})();
