// Setup mock data for tests
var Packages = new LocalCollection;
var Versions = new LocalCollection;
var Builds = new LocalCollection;

Packages.insert({ name: "sparky-forms" });
Packages.insert({ name: "forms" });
Packages.insert({ name: "sparkle" });

var insertVersion = function (name, version, ecv) {
  Versions.insert({ packageName: name, version: version, earliestCompatibleVersion: ecv });
};
insertVersion("sparky-forms", "1.1.2", "1.1.0");
insertVersion("forms", "1.0.1", "1.0.0");
insertVersion("sparkle", "2.1.1", "2.1.0");
insertVersion("sparkle", "1.0.0", "1.0.0");

var insertBuild = function (name, version, ecv, deps) {
  Builds.insert({ packageName: name, version: version,
                  earliestCompatibleVersion: ecv, architecture: "all",
                  dependencies: deps});
};

insertBuild("sparky-forms", "1.1.2", "1.1.0", [{ packageName: "forms", version: "=1.0.1" }, { packageName: "sparkle", version: "=2.1.1" }]);
insertBuild("forms", "1.0.1", "1.0.0");
insertBuild("sparkle", "2.1.1", "2.1.0");
insertBuild("sparkle", "1.0.0", "1.0.0");

var resolver = new ConstraintSolver.Resolver(Packages, Versions, Builds);

var currentTest = null;
var t = function (deps, expected) {
  var resolvedDeps = resolver.resolve(deps);
  currentTest.equal(resolvedDeps, expected);
};

var t_progagateExact = function (deps, expected) {
  var resolvedDeps = resolver.propagatedExactDeps(deps);
  currentTest.equal(resolvedDeps, expected);
};

var FAIL = function (deps) {
  currentTest.throws(function () {
    var resolvedDeps = resolver.resolve(deps);
  });
};

Tinytest.add("constraint solver - exact dependencies", function (test) {
  currentTest = test;
  t_progagateExact({ "sparky-forms": "=1.1.2" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "forms": "=1.0.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "sparkle": "=2.1.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });

  FAIL({ "sparky-forms": "=1.1.2", "sparkle": "=1.0.0" });
  // something that isn't available for your architecture
  FAIL({ "sparky-forms": "=1.1.2", "sparkle": "=2.0.0" });
  FAIL({ "sparky-forms": "=0.0.1" });
});

