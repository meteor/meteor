// ReactiveVar is like a portable Session var.  When you get it,
// it registers a dependency, and when it's set, it invalidates
// its dependencies.
//
// When set to a primitive value, invalidation
// is only fired if the new value is !== the old one.  When set
// to an object value, invalidation always happens.  Each behavior
// may be desirable in different test scenarios.
// body and keeps track of it, providing methods that query it,
// mutate, and destroy it.
//
// Constructor, with optional 'new':
// var R = [new] ReactiveVar([initialValue])


var ReactiveVar = function(initialValue) {
  if (! (this instanceof ReactiveVar))
    return new ReactiveVar(initialValue);

  this._value = (typeof initialValue === "undefined" ? null :
                 initialValue);
  this._deps = {};
  this._equals_deps = {};
};

ReactiveVar.prototype.get = function() {
  var self = this;

  var context = Meteor.deps.Context.current;
  if (context && !(context.id in self._deps)) {
    self._deps[context.id] = context;
    context.on_invalidate(function() {
      delete self._deps[context.id];
    });
  }

  return self._value;
};

ReactiveVar.prototype.set = function(newValue) {
  var self = this;
  var oldValue = self._value;
  // detect equality and don't invalidate dependers
  // when value is a primitive.
  if ((typeof newValue !== 'object') && self._value === newValue)
    return;

  self._value = newValue;

  for(var id in self._deps)
    self._deps[id].invalidate();
  for(var id in self._equals_deps[newValue])
    self._equals_deps[newValue][id].invalidate();
  for(var id in self._equals_deps[oldValue])
    self._equals_deps[oldValue][id].invalidate();

};

ReactiveVar.prototype.equals = function(value) {
  var self = this;
  var equals_deps = self._equals_deps;
  var context = Meteor.deps.Context.current;

  if (context) {
    if (!(value in equals_deps))
      equals_deps[value] = {};

    if (!(context.id in equals_deps[value])) {
      equals_deps[value][context.id] = context;
      context.on_invalidate(function () {
        delete equals_deps[value][context.id];

        if (_.keys(equals_deps[value]).length == 0)
          delete equals_deps[value];
      });
    }
  }
  return self._value === value;

}

ReactiveVar.prototype.numListeners = function() {
  return _.keys(this._deps).length;
};

ReactiveVar.prototype.toJSON = function() {
  return this._value;
}


var ReactiveDict = function(initialValues) {
  if (! (this instanceof ReactiveDict))
    return new ReactiveDict(initialValues);

  this._vars = {};

  for (key in initialValues)
    this._vars[key] = ReactiveVar(initialValues[key]);
}

ReactiveDict.prototype.get = function(key) {
  this._ensureKey(key);
  return this._vars[key].get();
}

ReactiveDict.prototype.set = function(key, value) {
  this._ensureKey(key);
  return this._vars[key].set(value);
}

ReactiveDict.prototype.setMany = function(values) {
  var self = this;
  _.each(values,function(value,key) {
    self.set(key,value);
  });
}

ReactiveDict.prototype.equals = function(key, value) {
  this._ensureKey(key);
  return this._vars[key].equals(value);
}

ReactiveDict.prototype._ensureKey = function(key) {
  if (!(key in this._vars))
    this._vars[key] = ReactiveVar();
}

ReactiveDict.prototype.toJSON = function() {
  var self = this;
  var json = {};
  _.each(self._vars,function(v,key) {
    json[key] = v.toJSON();
  });
  return json;
}

