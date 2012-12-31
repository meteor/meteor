

(function () {

var ObjectID;
if (typeof Meteor === 'undefined' || Meteor.isClient) {
  ObjectID = LocalCollection._ObjectID;
} else {
  ObjectID = __meteor_bootstrap__.require('mongodb').ObjectID;
  ObjectID.prototype.valueOf = function() {
    return this.toHexString();
  };
}

LocalCollection._idToDDP = function (id) {
  if (id instanceof ObjectID) {
    return id.valueOf();
  } else if (_.isString(id)) {
    if (id === "") {
      return id;
    } else if (id[0] === "-" || // escape previously dashed strings
               LocalCollection._isObjectID(id) || // escape object-id-form strings
               id[0] === '{') { // escape object-form strings, for maybe implementing later
      return "-" + id;
    } else {
      return id; // other strings go through unchanged.
    }
  } else {
      throw new Error("Meteor's MongoDB does not yet handle ids other than strings and ObjectIDs");
  }
};

LocalCollection._idFromDDP = function (id) {
  if (id === "") {
    return id;
  } else if (id[0] === '-') {
    return id.substr(1);
  } else if (LocalCollection._isObjectID(id)) {
    return new ObjectID(id);
  } else {
    return id;
  }
};

})();
