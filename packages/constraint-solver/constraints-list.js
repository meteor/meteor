var semver = Npm.require('semver');

////////////////////////////////////////////////////////////////////////////////
// ConstraintsList
////////////////////////////////////////////////////////////////////////////////
// A persistent data-structure that keeps references to Constraint objects
// arranged by the "name" field of Constraint, exact field and version.
//
// Internal structure has the "length" field for the number of elements stored
// and the "byName" map that has the following structure:
// byName:
//   - nameOfPackage:
//     - exact:
//       - versionString <=> exactConstraintInstance
//     - inexact:
//       - versionString <=> inexactConstraintInstance
ConstraintSolver.ConstraintsList = function (prev) {
  var self = this;

  if (prev) {
    self.byName = prev.byName;
    self.length = prev.length;
  } else {
    self.byName = mori.hash_map();
    self.length = 0;
  }
};

ConstraintSolver.ConstraintsList.prototype.contains = function (c) {
  var self = this;
  if (! mori.has_key(self.byName, c.name))
    return false;

  var bn = mori.get(self.byName, c.name);
  var constraints = mori.get(bn, c.type === "exactly" ? "exact" : "inexact");
  return mori.has_key(constraints, c.version);
};

// returns a new version containing passed constraint
ConstraintSolver.ConstraintsList.prototype.push = function (c) {
  var self = this;

  if (self.contains(c)) {
    return self;
  }

  var newList = new ConstraintSolver.ConstraintsList(self);

  // create a record or update the lookup table
  if (! mori.has_key(self.byName, c.name)) {
    var exactMap = mori.hash_map();
    var inexactMap = mori.hash_map();

    if (c.type === "exactly") {
      exactMap = mori.assoc(exactMap, c.version, c);
    } else {
      inexactMap = mori.assoc(inexactMap, c.version, c);
    }

    var bn = mori.hash_map("exact", exactMap, "inexact", inexactMap);
    newList.byName = mori.assoc(newList.byName, c.name, bn);
  } else {
    var exactStr = c.type === "exactly" ? "exact" : "inexact";

    var bn = mori.get(newList.byName, c.name);
    var constraints = mori.get(bn, exactStr);
    constraints = mori.assoc(constraints, c.version, c);
    bn = mori.assoc(bn, exactStr, constraints);
    newList.byName = mori.assoc(newList.byName, c.name, bn);
  }

  newList.length++;

  return newList;
};

ConstraintSolver.ConstraintsList.prototype.forPackage = function (name, iter) {
  var self = this;
  var forPackage = mori.get(self.byName, name);
  var exact = mori.get(forPackage, "exact");
  var inexact = mori.get(forPackage, "inexact");

  var breaked = false;
  var niter = function (pair) {
    if (iter(mori.last(pair)) === BREAK) {
      breaked = true;
      return true;
    }
  };

  mori.some(niter, exact);
  if (breaked)
    return;
  mori.some(niter, inexact);
};

// doesn't break on the false return value
ConstraintSolver.ConstraintsList.prototype.each = function (iter) {
  var self = this;
  mori.each(self.byName, function (nameAndColl) {
    mori.each(mori.last(nameAndColl), function (exactInexactColl) {
      mori.each(mori.last(exactInexactColl), function (c) {
        iter(mori.last(c));
      });
    });
  });
};

// Checks if the passed unit version satisfies all of the constraints.
ConstraintSolver.ConstraintsList.prototype.isSatisfied = function (
    uv, resolver) {
  var self = this;

  var satisfied = true;

  self.forPackage(uv.name, function (c) {
    if (! c.isSatisfied(uv, resolver)) {
      satisfied = false;
      return BREAK;
    }
  });

  return satisfied;
};

ConstraintSolver.ConstraintsList.prototype.toString = function (simple) {
  var self = this;
  var str = "";

  var strs = [];

  self.each(function (c) {
    strs.push(c.toString());
  });

  strs.sort();

  _.each(strs, function (c) {
    if (str !== "") {
      str += simple ? " " : ", ";
    }
    str += c;
  });

  return simple ? str : "<constraints list: " + str + ">";
};
