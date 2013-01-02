

(function () {

var ObjectID;

LocalCollection._isObjectID = function (str) {
  return str.length === 24 && str.match(/^[0-9a-f]*$/);
};

LocalCollection._ObjectID = function (hexString) {
  //random-based impl of Mongo ObjectID
  var self = this;
  if (hexString) {
    hexString = hexString.toLowerCase();
    if (!LocalCollection._isObjectID(hexString)) {
      throw new Error("Invalid hexidecimal string for creating an ObjectID");
    }
    self.str = hexString;
  } else {
    self.str = LocalCollection._randomHexString(24);
  }
};

LocalCollection._ObjectID.prototype.toString = function () {
  var self = this;
  return "ObjectID(\"" + self.str + "\")";
};

LocalCollection._ObjectID.prototype.equals = function (other) {
  var self = this;
  return self.valueOf() === other.valueOf();
};
LocalCollection._ObjectID.prototype.clone = function () {
  var self = this;
  return new LocalCollection._ObjectID(self.str);
};

LocalCollection._ObjectID.prototype.valueOf = function () { return this.str; };

LocalCollection._ObjectID.prototype.serializeForEval = function () {
  var self = this;
  return "new LocalCollection._ObjectID(\"" + self.str + "\")";
};


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
