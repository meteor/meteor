var semver = require('semver');
var _ = require('underscore');
var catalog = require('./catalog.js');
var utils = require('./utils.js');

var constraintSolver = exports;

// Comment this out until we have a way to get Match here
/*
var Dependency = {
  packageName: String,
  version: Match.OneOf(String, null), // XXX 'x.y.z' or 'x.y.z'
  exact: Match.Optional(Boolean),
  weak: Match.Optional(Boolean),
  unordered: Match.Optional(Boolean)
};
*/

// XXX copied (with simplifications) from EJSON.clone
var deepClone = function (v) {
  var ret;
  if (typeof v !== "object")
    return v;
  if (v === null)
    return null; // null has typeof "object"
  // XXX: Use something better than underscore's isArray
  if (_.isArray(v) || _.isArguments(v)) {
    // For some reason, _.map doesn't work in this context on Opera (weird test
    // failures).
    ret = [];
    for (i = 0; i < v.length; i++)
      ret[i] = deepClone(v[i]);
    return ret;
  }
  // handle other objects
  ret = {};
  _.each(v, function (value, key) {
    ret[key] = deepClone(value);
  });
  return ret;
};



// main class
constraintSolver.Resolver = function (options) {
  var self = this;

  options = options || {};
  var architecture = options.architecture || "all";

  // map package-name -> map
  //  map version -> object
  //    - dependendencies
  //    - earliestCompatibleVersion
  self.packageDeps = {};

  // package name -> list of version strings that we know about for the
  // package, sorted in ascending semver order
  self.sortedVersionsForPackage = {};

  _.each(catalog.getAllPackageNames(), function (packageName) {
    var packageDef = catalog.getPackage(packageName);
    self.packageDeps[packageDef.name] = {};

    var versions = catalog.getSortedVersions(packageName);
    self.sortedVersionsForPackage[packageDef.name] = versions;

    _.each(versions, function (version) {
      var versionDef = catalog.getVersion(packageName, version);
      // version is a string #version-name-conflict
      var packageDep = {};
      packageDep.earliestCompatibleVersion = versionDef.earliestCompatibleVersion;
      packageDep.dependencies = _.map(versionDef.dependencies, function (dep, packageName) {
        return _.extend({packageName: packageName},
                        utils.parseVersionConstraint(dep.constraint));
      });

      self.packageDeps[packageDef.name][versionDef.version] = packageDep;
    });
  });
};

// The propagation of exact dependencies
// XXX empties the exactDepsStack
// XXX extends the depsDict
// XXX after this depsStack can contain duplicates
constraintSolver.Resolver.prototype._propagateExactDeps =
  function (depsDict, exactDepsStack) {
  var self = this;
  var picks = {};

  _.each(exactDepsStack, function (dep) { picks[dep.packageName] = dep.version; });

  while (exactDepsStack.length > 0) {
    var currentPick = exactDepsStack.pop();
    try {
      var currentDependencies =
        self.packageDeps[currentPick.packageName][currentPick.version].dependencies;
    } catch (err) {
      if (! _.has(self.packageDeps, currentPick.packageName))
        throw new Error("There is no required package found: " + currentPick.packageName);
      if (! _.has(self.packageDeps[currentPick.packageName], currentPick.version))
        throw new Error("There is no required package version found for the requested architecture: " + currentPick.packageName + "@" + currentPick.version);
    }

    _.each(pickExactDeps(currentDependencies), function (dep) {
      if (_.has(picks, dep.packageName)) {
        // XXX this error message should be improved so you can get a lot more
        // context, like what are initial exact dependencies (those user
        // specified) and what is the eventual conflict.
        if (picks[dep.packageName] !== dep.version)
          throw new Error("Unresolvable: two exact dependencies conflict: " +
                          dep.packageName + " versions: " +
                          [picks[dep.packageName], dep.version].join(", "));
      } else {
        picks[dep.packageName] = dep.version;
        exactDepsStack.push(dep);
      }
    });

    _.each(rejectExactDeps(currentDependencies), function (dep) {
      depsDict[dep.packageName] = depsDict[dep.packageName] || [];
      depsDict[dep.packageName].push(dep);
    });
  };

  return picks;
};

constraintSolver.Resolver.prototype._resolve = function (dependencies, state) {
  // Comment this out until we have a way to get check() here
//  check(dependencies, [Dependency]); 

  state = state || {};
  state.picks = state.picks || {};

  var self = this;

  state.depsDict = state.depsDict || {};
  _.each(rejectExactDeps(dependencies), function (dep) {
    state.depsDict[dep.packageName] = state.depsDict[dep.packageName] || [];
    state.depsDict[dep.packageName].push(dep);
  });

  state.exactDepsStack = state.exactDepsStack || pickExactDeps(dependencies);

  var exactPicks = self._propagateExactDeps(state.depsDict, state.exactDepsStack);

  // add all exact dependencies the propagator picked to the set of picks
  _.each(exactPicks, function (version, packageName) {
    if (_.has(state.picks, packageName)) {
      if (state.picks[packageName] !== version)
        throw new Error("Exact dependencies contradict with already picked version for a package: "
                        + packageName + " " + state.picks[packageName] + ": " + version);
    } else {
      state.picks[packageName] = version;
    }
  });

  // check if all non-exact dependencies are still satisfied
  _.each(state.picks, function (version, packageName) {
    _.each(state.depsDict[packageName], function (dep) {
      if (! self.dependencyIsSatisfied(dep, version))
        throw new Error("Exact dependency contradicts on of the constraints for a package: "
                        + packageName + " " + version + ": " + dep.version);
    });
  });

  // calculate packages we depend on but didn't pick a version for yet
  // pick one of those and try different versions
  var candidatePackageNames = _.difference(_.keys(state.depsDict), _.keys(state.picks));
  if (_.isEmpty(candidatePackageNames)) {
    //console.log('there is nothing to look for! successsss');
    return state.picks;
  }

  var candidatePackageName = candidatePackageNames[0];
  var availableVersions = self.sortedVersionsForPackage[candidatePackageName];
  var satisfyingVersions = _.filter(availableVersions, function (version) {
    return _.all(state.depsDict[candidatePackageName], function (dep) {
      return self.dependencyIsSatisfied(dep, version);
    });
  });

  if (_.isEmpty(satisfyingVersions))
    throw new Error("Cannot find a satisfying versions of package: "
                    + candidatePackageName);

  for (var i = 0; i < satisfyingVersions.length; i++) {
    var version = satisfyingVersions[i];
    var newState = deepClone(state);
    newState.picks[candidatePackageName] = version;
    newState.exactDepsStack.push({
      packageName: candidatePackageName,
      version: version
    });
    //console.log('trying ' + candidatePackageName + ' v.' + versionDef.version);
    // recurse
    try {
      // if not failed, return a happy result
      return self._resolve(dependencies, newState);
    } catch (err) {
      //console.log('picking ' + candidatePackageName + ' v.' + version + ' kinda failed, lets not do that: ' + err.message);
    }
  };

  throw new Error("Cannot pick a satisfying version of package " + candidatePackageName);
};

constraintSolver.Resolver.prototype.resolve = function (dependencies) {
  var self = this;
  return self._resolve(toStructuredDeps(dependencies));
};

constraintSolver.Resolver.prototype.propagatedExactDeps = function (dependencies) {
  var self = this;

  dependencies = toStructuredDeps(dependencies);
  var depsStack = rejectExactDeps(dependencies);
  var exactDepsStack = pickExactDeps(dependencies);
  return self._propagateExactDeps(depsStack, exactDepsStack);
};

constraintSolver.Resolver.prototype.dependencyIsSatisfied =
  function (dep, version) {
  // XXX check for exact
  var self = this;

  if (dep.version === null)
    return true;


  var versionSpec = self.packageDeps[dep.packageName][version];
  return semver.lte(dep.version, version) &&
    semver.lte(versionSpec.earliestCompatibleVersion, dep.version);
};

// helpers
var isExact = function (dep) { return dep.exact; };
var pickExactDeps = function (deps) { return _.filter(deps, isExact); };
var rejectExactDeps = function (deps) { return _.reject(deps, isExact); };

// converts dependencies from simple format to the structured format
var toStructuredDeps = function (dependencies) {
  var structuredDeps = [];
  _.each(dependencies, function (details, packageName) {
    // if details is null, it means 'no constraint'
    if (typeof details === "string" || details === null) {
      structuredDeps.push(_.extend(
        { packageName: packageName },
        utils.parseVersionConstraint(details)));
    } else {
      structuredDeps.push(_.extend({ packageName: packageName }, details));
    }
  });

  return structuredDeps;
};
