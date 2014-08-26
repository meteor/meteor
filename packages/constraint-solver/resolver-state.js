ResolverState = function (resolver) {
  var self = this;
  self._resolver = resolver;
  // The versions we've already chosen.
  // unitName -> UnitVersion
  self.choices = mori.hash_map();
  // Units we need, but haven't chosen yet.
  // unitName -> sorted vector of (UnitVersions)
  self._dependencies = mori.hash_map();
  // Constraints that apply.
  self.constraints = new ConstraintSolver.ConstraintsList;
  // If we've already hit a contradiction.
  self.error = null;
};

_.extend(ResolverState.prototype, {
  addConstraint: function (constraint) {
    var self = this;
    if (self.error)
      return self;
    self = self._clone();

    self.constraints = self.constraints.push(constraint);

    var chosen = mori.get(self.choices, constraint.name);
    if (chosen && !constraint.isSatisfied(chosen, self._resolver)) {
      // This constraint conflicts with a choice we've already made!
      self.error = "conflict: " + constraint.toString({removeUnibuild: true}) +
        " vs " + chosen.version;
      return self;
    }

    var alternatives = mori.get(self._dependencies, constraint.name);
    if (alternatives) {
      // Note: filter preserves order, which is important.
      var newAlternatives = filter(alternatives, function (unitVersion) {
        return constraint.isSatisfied(unitVersion, self._resolver);
      });
      if (mori.is_empty(newAlternatives)) {
        // XXX we should mention other constraints that are active
        self.error = "conflict: " +
          constraint.toString({removeUnibuild: true}) + " cannot be satisfied";
      } else if (mori.count(newAlternatives) === 1) {
        // There's only one choice, so we can immediately choose it.
        self = self.addChoice(mori.first(newAlternatives));
      } else if (mori.count(newAlternatives) !== mori.count(alternatives)) {
        self._dependencies = mori.assoc(
          self._dependencies, constraint.name, newAlternatives);
      }
    }
    return self;
  },
  addDependency: function (unitName) {
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
      return self.constraints.isSatisfied(uv, self._resolver);
      // XXX hang on to list of violated constraints and use it in error
      // message
    });

    if (mori.is_empty(alternatives)) {
      // XXX mention constraints or something
      self.error = "conflict: " + removeUnibuild(unitName) +
        " can't be satisfied";
      return self;
    } else if (mori.count(alternatives) === 1) {
      // There's only one choice, so we can immediately choose it.
      self = self.addChoice(mori.first(alternatives));
    } else {
      self._dependencies = mori.assoc(
        self._dependencies, unitName, alternatives);
    }

    return self;
  },
  addChoice: function (uv) {
    var self = this;

    if (self.error)
      return self;
    if (mori.has_key(self.choices, uv.name))
      throw Error("Already chose " + uv.name);

    self = self._clone();

    // Does adding this choice break some constraints we already have?
    if (!self.constraints.isSatisfied(uv, self._resolver)) {
      // XXX improve error
      self.error = "conflict: " + uv.toString({removeUnibuild: true}) +
        " can't be chosen";
      return self;
    }

    // Great, move it from dependencies to choices.
    self.choices = mori.assoc(self.choices, uv.name, uv);
    self._dependencies = mori.dissoc(self._dependencies, uv.name);

    // Since we're committing to this version, we're committing to all it
    // implies.
    uv.constraints.each(function (constraint) {
      self = self.addConstraint(constraint);
    });
    _.each(uv.dependencies, function (unitName) {
      self = self.addDependency(unitName);
    });

    return self;
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
  _clone: function () {
    var self = this;
    var clone = new ResolverState(self._resolver);
    _.each(['choices', '_dependencies', 'constraints', 'error'], function (field) {
      clone[field] = self[field];
    });
    return clone;
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
