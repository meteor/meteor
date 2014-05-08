var mori = Npm.require('mori');

////////////////////////////////////////////////////////////////////////////////
// DependenciesList
////////////////////////////////////////////////////////////////////////////////
// A persistent data-structure that wrapps persistent dictionary

ConstraintSolver.DependenciesList = function (prev) {
  var self = this;

  if (prev) {
    self._mapping = prev._mapping;
    self._prioritized = prev._prioritized;
  } else {
    self._mapping = mori.hash_map();
    self._prioritized = mori.list();
  }
};

ConstraintSolver.DependenciesList.prototype.contains = function (d) {
  var self = this;
  return mori.has_key(self._mapping, d);
};

// returns a new version containing passed dependency
ConstraintSolver.DependenciesList.prototype.push = function (d) {
  var self = this;

  if (self.contains(d)) {
    return self;
  }

  var newList = new ConstraintSolver.DependenciesList(self);
  newList._mapping = mori.assoc(self._mapping, d, d);
  return newList;
};

ConstraintSolver.DependenciesList.prototype.remove = function (d) {
  var self = this;
  var newList = new ConstraintSolver.DependenciesList(self);
  newList._mapping = mori.dissoc(self._mapping, d);

  if (mori.peek(newList._prioritized) === d)
    newList._prioritized = mori.pop(newList._prioritized);

  return newList;
};

ConstraintSolver.DependenciesList.prototype.peek = function () {
  var self = this;
  var prioritized = mori.peek(self._prioritized);

  if (prioritized)
    return prioritized;

  return mori.last(mori.first(self._mapping));
};

// a weird method that returns a list of exact constraints those correspond to
// the dependencies in this list
ConstraintSolver.DependenciesList.prototype.exactConstraintsIntersection =
  function (constraintsList) {
  var self = this;
  var exactConstraints = new ConstraintSolver.ConstraintsList();

  self.each(function (d) {
    var c = mori.last(
      // pick an exact constraint for this dependency if such exists
      mori.last(mori.get(mori.get(constraintsList.byName, d), "exact")));

    if (c)
      exactConstraints = exactConstraints.push(c);
  });

  return exactConstraints;
};

ConstraintSolver.DependenciesList.prototype.union = function (anotherList) {
  var self = this;
  var newList = new ConstraintSolver.DependenciesList(self);
  newList._mapping = mori.union(newList._mapping, anotherList._mapping);

  return newList;
};

ConstraintSolver.DependenciesList.prototype.isEmpty = function () {
  var self = this;
  return mori.is_empty(self._mapping);
};

ConstraintSolver.DependenciesList.prototype.each = function (iter) {
  var self = this;
  mori.each(self._mapping, function (d) {
    iter(mori.last(d));
  });
};

ConstraintSolver.DependenciesList.prototype.toString = function (simple) {
  var self = this;
  var str = "";

  var strs = [];
  self.each(function (d) {
    strs.push(d);
  });

  strs.sort();
  _.each(strs, function (d) {
    if (str !== "") {
      str += simple ? " " : ", ";
    }
    str += d;
  });

  return simple ? str : "<dependencies list: " + str + ">";
};

ConstraintSolver.DependenciesList.prototype.toArray = function () {
  var self = this;
  var arr = [];
  self.each(function (d) {
    arr.push(d);
  });

  return arr;
};

ConstraintSolver.DependenciesList.fromArray = function (arr, prioritized) {
  var list = new ConstraintSolver.DependenciesList();
  var args = [];
  _.each(arr, function (d) {
    args.push(d);
    args.push(d);
  });

  list._mapping = mori.hash_map.apply(mori, args);

  // the whole list should also be added as prioritized
  if (prioritized) {
    _.each(arr, function (d) {
      list._prioritized = mori.conj(list._prioritized, d);
    });
  }

  return list;
};

