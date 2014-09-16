////////////////////////////////////////////////////////////////////////////////
// ConstraintsList
////////////////////////////////////////////////////////////////////////////////
// A persistent data-structure that keeps references to Constraint objects
// arranged by the "name" field of Constraint and exactness of the constraint.
//
// Internal structure has two maps, 'exact' and 'inexact'; they each map
// unit name -> mori.set(Constraint).  (This relies on the fact that Constraints
// are interned, so that mori.set can use reference identity.)
//
// We separate the constraints by exactness so that the iteration functions
// (forPackage and each) can easily provide exact constraints before inexact
// constraints, because exact constraints generally help the consumer pare down
// their possibilities faster.
// XXX This is just a theory, and it's not clear that we have benchmarks that
//     prove it.
ConstraintSolver.ConstraintsList = function (prev) {
  var self = this;

  if (prev) {
    self.exact = prev.exact;
    self.inexact = prev.inexact;
    self.minimalVersion = prev.minimalVersion;
  } else {
    self.exact = mori.hash_map();
    self.inexact = mori.hash_map();
    self.minimalVersion = mori.hash_map();
  }
};

ConstraintSolver.ConstraintsList.prototype.contains = function (c) {
  var self = this;
  var map = c.type === 'exactly' ? self.exact : self.inexact;
  return !!mori.get_in(map, [c.name, c]);
};

ConstraintSolver.ConstraintsList.prototype.getMinimalVersion = function (name) {
  var self = this;
  return mori.get(self.minimalVersion, name);
};

// returns a new version containing passed constraint
ConstraintSolver.ConstraintsList.prototype.push = function (c) {
  var self = this;

  if (self.contains(c)) {
    return self;
  }

  var newList = new ConstraintSolver.ConstraintsList(self);
  var mapField = c.type === 'exactly' ? 'exact' : 'inexact';
  // Get the current constraints on this package of the exactness, or an empty
  // set.
  var currentConstraints = mori.get(newList[mapField], c.name, mori.set());
  // Add this one.
  newList[mapField] = mori.assoc(newList[mapField],
                                 c.name,
                                 mori.conj(currentConstraints, c));

  // Maintain the "minimal version" that can satisfy these constraints.
  // Note that this is one of the only pieces of the constraint solver that
  // actually does logic on constraints (and thus relies on the restricted set
  // of constraints that we support).
  if (c.type !== 'any-reasonable') {
    var minimal = mori.get(newList.minimalVersion, c.name);
    if (!minimal || PackageVersion.lessThan(c.version, minimal)) {
      newList.minimalVersion = mori.assoc(
        newList.minimalVersion, c.name, c.version);
    }
  }
  return newList;
};

ConstraintSolver.ConstraintsList.prototype.forPackage = function (name, iter) {
  var self = this;
  var exact = mori.get(self.exact, name);
  var inexact = mori.get(self.inexact, name);

  var breaked = false;
  var niter = function (constraint) {
    if (iter(constraint) === BREAK) {
      breaked = true;
      return true;
    }
  };

  exact && mori.some(niter, exact);
  if (breaked)
    return;
  inexact && mori.some(niter, inexact);
};

// doesn't break on the false return value
ConstraintSolver.ConstraintsList.prototype.each = function (iter) {
  var self = this;
  _.each([self.exact, self.inexact], function (map) {
    mori.each(map, function (nameAndConstraints) {
      mori.each(mori.last(nameAndConstraints), iter);
    });
  });
};

// Checks if the passed unit version satisfies all of the constraints.
ConstraintSolver.ConstraintsList.prototype.isSatisfied = function (
    uv, resolver, resolveContext) {
  var self = this;

  var satisfied = true;

  self.forPackage(uv.name, function (c) {
    if (! c.isSatisfied(uv, resolver, resolveContext)) {
      satisfied = false;
      return BREAK;
    }
  });

  return satisfied;
};

ConstraintSolver.ConstraintsList.prototype.toString = function (options) {
  var self = this;
  options = options || {};

  var strs = [];

  self.each(function (c) {
    strs.push(c.toString({removeUnibuild: options.removeUnibuild}));
  });

  strs.sort();

  return "<constraints list: " + strs.join(", ") + ">";
};
