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

ReactiveVar = function(initialValue) {
  if (! (this instanceof ReactiveVar))
    return new ReactiveVar(initialValue);

  this._value = (typeof initialValue === "undefined" ? null :
                 initialValue);
  this._deps = new Deps.Dependency;
};

ReactiveVar.prototype.get = function() {
  this._deps.depend();
  return this._value;
};

ReactiveVar.prototype.set = function(newValue) {
  // detect equality and don't invalidate dependers
  // when value is a primitive.
  if ((typeof newValue !== 'object') && this._value === newValue)
    return;

  this._value = newValue;

  this._deps.changed();
};

ReactiveVar.prototype.numListeners = function() {
  // accesses private field (tests want to know)
  return _.keys(this._deps._dependentsById).length;
};
