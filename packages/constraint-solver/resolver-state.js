var util = Npm.require('util');

ResolverState = function (resolver, resolveContext) {
  var self = this;
  self._resolver = resolver;
  self._resolveContext = resolveContext;
  // The versions we've already chosen.
  // unitName -> UnitVersion
  self.choices = mori.hash_map();
  // Units we need, but haven't chosen yet.
  // unitName -> sorted vector of (UnitVersions)
  self._dependencies = mori.hash_map();
  // Constraints that apply.
  self.constraints = new ConstraintSolver.ConstraintsList;
  // How we've decided things about units.
  // unitName -> set(list (reversed) of UVs that led us here).
  self._unitPathways = mori.hash_map();
  // If we've already hit a contradiction.
  self.error = null;
};

_.extend(ResolverState.prototype, {
  addConstraint: function (constraint, pathway) {
    var self = this;
    if (self.error)
      return self;

    // Add the constraint.
    var newConstraints = self.constraints.push(constraint);
    // If we already had the constraint, we're done.
    if (self.constraints === newConstraints)
      return self;

    self = self._clone();
    self.constraints = newConstraints;
    self._addPathway(constraint.name, pathway);

    var chosen = mori.get(self.choices, constraint.name);
    if (chosen &&
        !constraint.isSatisfied(chosen, self._resolver, self._resolveContext)) {
      // This constraint conflicts with a choice we've already made!
      self.error = util.format(
        "conflict: constraint %s is not satisfied by %s.\n" +
        "Constraints on %s come from:\n%s",
        constraint.toString({removeUnibuild: true}),
        chosen.version,
        removeUnibuild(constraint.name),
        self._shownPathwaysForConstraintsIndented(constraint.name));
      return self;
    }

    var alternatives = mori.get(self._dependencies, constraint.name);
    if (alternatives) {
      // Note: filter preserves order, which is important.
      var newAlternatives = filter(alternatives, function (unitVersion) {
        return constraint.isSatisfied(
          unitVersion, self._resolver, self._resolveContext);
      });
      if (mori.is_empty(newAlternatives)) {
        self.error = util.format(
          "conflict: constraints on %s cannot all be satisfied.\n" +
            "Constraints come from:\n%s",
          removeUnibuild(constraint.name),
          self._shownPathwaysForConstraintsIndented(constraint.name));
      } else if (mori.count(newAlternatives) === 1) {
        // There's only one choice, so we can immediately choose it.
        self = self.addChoice(mori.first(newAlternatives), pathway);
      } else if (mori.count(newAlternatives) !== mori.count(alternatives)) {
        self._dependencies = mori.assoc(
          self._dependencies, constraint.name, newAlternatives);
      }
    }
    return self;
  },
  addDependency: function (unitName, pathway) {
    var self = this;

    if (self.error || mori.has_key(self.choices, unitName)
        || mori.has_key(self._dependencies, unitName)) {
      return self;
    }

    self = self._clone();

    if (!_.has(self._resolver.unitsVersions, unitName)) {
      self.error = "unknown package: " + removeUnibuild(unitName);
      return self;
    }

    // Note: relying on sortedness of unitsVersions so that alternatives is
    // sorted too (the estimation function uses this).
    var alternatives = filter(self._resolver.unitsVersions[unitName], function (uv) {
      return self.isSatisfied(uv);
      // XXX hang on to list of violated constraints and use it in error
      // message
    });

    if (mori.is_empty(alternatives)) {
      self.error = util.format(
        "conflict: constraints on %s cannot be satisfied.\n" +
          "Constraints come from:\n%s",
        removeUnibuild(unitName),
        self._shownPathwaysForConstraintsIndented(unitName));
      return self;
    } else if (mori.count(alternatives) === 1) {
      // There's only one choice, so we can immediately choose it.
      self = self.addChoice(mori.first(alternatives), pathway);
    } else {
      self._dependencies = mori.assoc(
        self._dependencies, unitName, alternatives);
      self._addPathway(unitName, pathway);
    }

    return self;
  },
  addChoice: function (uv, pathway) {
    var self = this;

    if (self.error)
      return self;
    if (mori.has_key(self.choices, uv.name))
      throw Error("Already chose " + uv.name);

    self = self._clone();

    // Does adding this choice break some constraints we already have?
    if (!self.isSatisfied(uv)) {
      // This shouldn't happen: all calls to addChoice should occur based on
      // choosing it from a list of satisfied alternatives.
      throw new Error("try to choose an unsatisfied version?");
    }

    // Great, move it from dependencies to choices.
    self.choices = mori.assoc(self.choices, uv.name, uv);
    self._dependencies = mori.dissoc(self._dependencies, uv.name);
    self._addPathway(uv.name, pathway);

    // Since we're committing to this version, we're committing to all it
    // implies.
    var pathwayIncludingUv = mori.cons(uv, pathway);
    uv.constraints.each(function (constraint) {
      self = self.addConstraint(constraint, pathwayIncludingUv);
    });
    _.each(uv.dependencies, function (unitName) {
      self = self.addDependency(unitName, pathwayIncludingUv);
    });

    return self;
  },
  // this mutates self, so only call on a newly _clone'd and not yet returned
  // object.
  _addPathway: function (unitName, pathway) {
    var self = this;
    self._unitPathways = mori.assoc(
      self._unitPathways, unitName,
      mori.conj(mori.get(self._unitPathways, unitName, mori.set()),
                pathway));
  },
  success: function () {
    var self = this;
    return !self.error && mori.is_empty(self._dependencies);
  },
  eachDependency: function (iter) {
    var self = this;
    mori.some(function (nameAndAlternatives) {
      return BREAK == iter(mori.first(nameAndAlternatives),
                           mori.last(nameAndAlternatives));
    }, self._dependencies);
  },
  isSatisfied: function (uv) {
    var self = this;
    return self.constraints.isSatisfied(uv, self._resolver, self._resolveContext);
  },
  somePathwayForUnitName: function (unitName) {
    var self = this;
    var pathways = mori.get(self._unitPathways, unitName);
    if (!pathways)
      return mori.list();
    return mori.first(pathways);
  },
  _clone: function () {
    var self = this;
    var clone = new ResolverState(self._resolver, self._resolveContext);
    _.each(['choices', '_dependencies', 'constraints', 'error', '_unitPathways'], function (field) {
      clone[field] = self[field];
    });
    return clone;
  },
  _shownPathwaysForConstraints: function (unitName) {
    var self = this;
    var pathways = mori.into_array(mori.map(function (pathway) {
      return showPathway(pathway, unitName);
    }, mori.get(self._unitPathways, unitName)));
    pathways.sort();
    pathways = _.uniq(pathways, true);
    return pathways;
  },
  _shownPathwaysForConstraintsIndented: function (unitName) {
    var self = this;
    return _.map(self._shownPathwaysForConstraints(unitName), function (pathway) {
      return "  " + (pathway ? pathway : "<top level>");
    }).join("\n");
  }
});

// Helper for filtering a vector in mori. mori.filter returns a lazy sequence,
// which is cool, but we actually do want to coerce to a vector since we (eg the
// estimation function) runs mori.last on it a bunch and we'd like to only
// do the O(n) work once.
var filter = function (v, pred) {
  return mori.into(mori.vector(), mori.filter(pred, v));
};

// Users are mostly confused by seeing "package#web.browser" instead of just
// "package". Remove it for error messages.
removeUnibuild = function (unitName) {
  // For debugging constraint solver issues.
  if (process.env.METEOR_SHOW_UNIBUILDS)
    return unitName;
  return unitName.split('#')[0];
};

// XXX from Underscore.String (http://epeli.github.com/underscore.string/)
// XXX how many copies of this do we have in Meteor?
var startsWith = function(str, starts) {
  return str.length >= starts.length &&
    str.substring(0, starts.length) === starts;
};

var showPathway = function (pathway, dropIfFinal) {
  var pathUnits = mori.into_array(mori.map(function (uv) {
    return uv.toString({removeUnibuild: true});
  }, mori.reverse(pathway)));

  var dropPrefix = removeUnibuild(dropIfFinal) + '@';
  while (pathUnits.length && startsWith(_.last(pathUnits), dropPrefix)) {
    pathUnits.pop();
  }

  // This is a bit of a hack: we're using _.uniq in "it's sorted" mode, whose
  // implementation is "drop adjacent duplicates". This is what we want (we're
  // trying to avoid seeing "foo -> foo" which represents "foo#os ->
  // foo#web.browser") even though it's not actually sorted.
  pathUnits = _.uniq(pathUnits, true);
  return pathUnits.join(' -> ');
};
