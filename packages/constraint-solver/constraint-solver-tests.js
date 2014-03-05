// Setup mock data for tests
var Packages = new LocalCollection;
var Versions = new LocalCollection;
var Builds = new LocalCollection;

Packages.insert({ name: "sparky-forms" });
Packages.insert({ name: "forms" });
Packages.insert({ name: "sparkle" });

Versions.insert({ packageName: "sparky-forms", version: "1.1.2", earliestCompatibleVersion: "1.1.0" });
Versions.insert({ packageName: "forms", version: "1.0.1", earliestCompatibleVersion: "1.0.0" });
Versions.insert({ packageName: "sparkle", version: "2.1.1", earliestCompatibleVersion: "2.1.0" });

Builds.insert({ packageName: "sparky-forms", version: "1.1.2", earliestCompatibleVersion: "1.1.0", architecture: "all",
                dependencies: [{ packageName: "forms", version: "=1.0.1" }, { packageName: "sparkle", version: "=2.1.1" }]});

Builds.insert({ packageName: "forms", version: "1.0.1", earliestCompatibleVersion: "1.0.0", architecture: "all" });
Builds.insert({ packageName: "sparkle", version: "2.1.1", earliestCompatibleVersion: "2.1.0", architecture: "all" });

var resolver = new ConstraintSolver.Resolver(Packages, Versions, Builds);

var currentTest = null;
var t = function (deps, expected) {
  var resolvedDeps = resolver.resolve(deps);
  currentTest.equal(resolvedDeps, expected);
};

Tinytest.add("constraint solver - exact dependencies", function (test) {
  currentTest = test;
  t({ "sparky-forms": "=1.1.2" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t({ "sparky-forms": "=1.1.2", "forms": "=1.0.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t({ "sparky-forms": "=1.1.2", "sparkle": "=2.1.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
});

