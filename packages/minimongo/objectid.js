

(function () {

LocalCollection._idToDDP = function (id) {
  if (id instanceof ObjectId) {
    return id.valueOf();
  } else if (_.isString(id)) {
    if (id === "") {
      return id;
    } else if (id[0] === "-" || // escape previously dashed strings
               LocalCollection._isObjectId(id) || // escape object-id-form strings
               id[0] === '{') { // escape object-form strings, for maybe implementing later
      return "-" + id;
    } else {
      return id; // other strings go through unchanged.
    }
  } else {
      throw new Error("Meteor's MongoDB does not yet handle ids other than strings and ObjectIds");
  }
};

LocalCollection._idFromDDP = function (id) {
  if (id === "") {
    return id;
  } else if (id[0] === '-') {
    return id.substr(1);
  } else if (LocalCollection._isObjectId(id)) {
    return new ObjectId(id);
  } else {
    return id;
  }
};

})();
