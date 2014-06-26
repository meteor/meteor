Blaze.ReactiveVar = function (initialValue) {
  var self = this;

  self.curValue = initialValue;
  self.dep = new Deps.Dependency;
};

Blaze.ReactiveVar._isEqual = function (a, b) {
  // Two values are equal if they are `===` and are
  // number, boolean, string, undefined, or null.
  if (a !== b)
    return false;
  else
    return ((!a) || (typeof a === 'number') || (typeof a === 'boolean') ||
            (typeof a === 'string'));
};

Blaze.ReactiveVar.prototype.get = function () {
  if (Deps.active)
    this.dep.depend();

  return this.curValue;
};

Blaze.ReactiveVar.prototype.set = function (newValue) {
  var oldValue = this.curValue;

  if (Blaze.ReactiveVar._isEqual(oldValue, newValue))
    // value is same as last time
    return;

  this.curValue = newValue;
  this.dep.changed();
};

Blaze.ReactiveVar.prototype.toString = function () {
  return 'ReactiveVar{' + this.get() + '}';
};
