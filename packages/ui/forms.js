var Component = UIComponent;

var getterImpl =
      function (foo) {
        var fooDep = foo + "Dep";
        var _foo = "_" + foo;
        return function () {
          this[fooDep].depend();
          return this[_foo];
        };
      };

Component({
  extendHooks: {
    fields: function (dict) {
      var proto = this.prototype;
      var type = this;

      for (var fieldName in dict)
        proto[fieldName] = getterImpl(fieldName);

      type.augment({
        constructed: function () {
          for (var fieldName in dict) {
            this["_" + fieldName] = dict[fieldName];
            this[fieldName + "Dep"] = new Deps.Dependency;
          }
        }
      });
    }
  },

  set: function (fieldName, fieldValue) {
    var _foo = "_" + fieldName;
    var fooDep = fieldName + "Dep";

    if ((_foo in this) && (fooDep in this)) {
      // XXX compare with something besides `===`?
      // do fields have to be EJSON or can they be anything?
      if (fieldValue !== this[_foo]) {
        this[_foo] = fieldValue;
        if (fooDep in this)
          this[fooDep].changed();
      }
    } else {
      throw new Error("No such field: " + fieldName);
    }
  }
});