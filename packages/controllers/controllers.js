(function () {

FieldSet = Spark.Landmark.extend({
  init: function () {
    this._fieldValues = new ReactiveDict; // XXX get migration data
  },
  get: function (key) {
    return this._fieldValues.get(key);
  },
  set: function (key, value) {
    return this._fieldValues.set(key, value);
  },
  equals: function (key, value) {
    return this._fieldValues.equals(key, value);
  }
});

}());
