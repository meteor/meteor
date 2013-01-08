

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

LocalCollection._ObjectID.prototype.typeName = function() {
  return "oid";
};

LocalCollection._ObjectID.prototype.valueOf =
    LocalCollection._ObjectID.prototype.toJSONValue =
    function () { return this.str; };

LocalCollection._ObjectID.prototype.serializeForEval = function () {
  var self = this;
  return "new LocalCollection._ObjectID(\"" + self.str + "\")";
};

// Is this selector just shorthand for lookup by _id?
LocalCollection._selectorIsId = function (selector) {
  return (typeof selector === "string") ||
    (typeof selector === "number") ||
    selector instanceof LocalCollection._findObjectIDClass();
};


LocalCollection._findObjectIDClass = function () {
  if (typeof Meteor === 'undefined' || Meteor.isClient) {
    return LocalCollection._ObjectID;
  } else {
    return Meteor.Collection.ObjectID;
  }
};



})();
