var _ = require('underscore');
var constraintSolver = require('../constraint-solver.js');
var selftest = require('../selftest.js');
var semver = require('semver');
var fail = selftest.fail;

var uniload = require('./uniload.js');
var LocalCollection = uniload.load({
  packages: [ 'meteor', 'minimongo' ],
  release: release.current.name
}).minimongo.LocalCollection;

// Setup mock data for tests
var Packages = new LocalCollection;
var Versions = new LocalCollection;
var Builds = new LocalCollection;

Packages.insert({ name: "sparky-forms" });
Packages.insert({ name: "forms" });
Packages.insert({ name: "sparkle" });
Packages.insert({ name: "awesome-dropdown" });
Packages.insert({ name: "dropdown" });
Packages.insert({ name: "jquery-widgets" });
Packages.insert({ name: "jquery" });

var insertVersion = function (name, version, ecv, deps) {
  var constructedDeps = {};
  _.each(deps, function (constraint, name) {
    constructedDeps[name] = {
      constraint: constraint,
      references: [
        { slice: "os", arch: "all", targetSlice: "os", weak: false,
          implied: false, unordered: false },
        { slice: "browser", arch: "all", targetSlice: "browser", weak: false,
          implied: false, unordered: false }]
    };
  });
  Versions.insert({ packageName: name, version: version, earliestCompatibleVersion: ecv,
                    dependencies: constructedDeps });
};
insertVersion("sparky-forms", "1.1.2", "1.0.0", {"forms": "=1.0.1", "sparkle": "=2.1.1"});
insertVersion("forms", "1.0.1", "1.0.0", {"sparkle": "2.1.0", "jquery-widgets": "1.0.0"});
insertVersion("sparkle", "2.1.0", "2.1.0", {"jquery": "1.8.2"});
insertVersion("sparkle", "2.1.1", "2.1.0", {"jquery": "1.8.2"});
insertVersion("sparkle", "1.0.0", "1.0.0");
insertVersion("awesome-dropdown", "1.5.0", "1.0.0", {"dropdown": "=1.2.2"});
insertVersion("dropdown", "1.2.2", "1.0.0", {"jquery-widgets": "1.0.0"});
insertVersion("jquery-widgets", "1.0.0", "1.0.0", {"jquery": "1.8.0", "sparkle": "2.1.1"});
insertVersion("jquery-widgets", "1.0.2", "1.0.0", {"jquery": "1.8.0", "sparkle": "2.1.1"});
insertVersion("jquery", "1.8.0", "1.8.0");
insertVersion("jquery", "1.8.2", "1.8.0");

var insertBuild = function (name, version, ecv) {
  Builds.insert({ packageName: name, version: version,
                  earliestCompatibleVersion: ecv, architecture: [ "browser", "os" ] });
};

insertBuild("sparky-forms", "1.1.2", "1.1.0");
insertBuild("forms", "1.0.1", "1.0.0");
insertBuild("sparkle", "2.1.1", "2.1.0");
insertBuild("sparkle", "2.1.0", "2.1.0");
insertBuild("sparkle", "1.0.0", "1.0.0");
insertBuild("awesome-dropdown", "1.5.0", "1.0.0");
insertBuild("dropdown", "1.2.2", "1.0.0");
insertBuild("jquery-widgets", "1.0.0", "1.0.0");
insertBuild("jquery-widgets", "1.0.2", "1.0.0");
insertBuild("jquery", "1.8.0", "1.0.0");
insertBuild("jquery", "1.9.0", "1.0.0");

// XXX Temporary hack: make a catalog stub to pass in to the
// constraint solver. We used to do this because constraint-solver was
// in a package and the catalog was not. Now that they are together,
// maybe we should add a function to catalog.js that lets us create a
// stub Catalog.
var catalogStub = {
  packages: Packages,
  versions: Versions,
  builds: Builds,
  getAllPackageNames: function () {
    return _.pluck(Packages.find().fetch(), 'name');
  },
  getPackage: function (name) {
    return this.packages.findOne({ name: name });
  },
  getSortedVersions: function (name) {
    return _.pluck(
      this.versions.find({
        packageName: name
      }, { fields: { version: 1 } }).fetch(),
      'version'
    ).sort(semver.compare);
  },
  getVersion: function (name, version) {
    return this.versions.findOne({
      packageName: name,
      version: version
    });
  }
};

// XXX we have a problem, which is that constraintSolver no longer
// takes a Catalog anymore -- it uses the singleton catalog. We need
// to come up with a new way to stub the catalog.
var resolver = new constraintSolver.Resolver(catalogStub);

var t = function (deps, expected) {
  var resolvedDeps = resolver.resolve(deps);
  selftest.expectEqual(resolvedDeps, expected);
};

var t_progagateExact = function (deps, expected) {
  var resolvedDeps = resolver.propagatedExactDeps(deps);
  selftest.expectEqual(resolvedDeps, expected);
};

var FAIL = function (deps) {
  currentTest.expectThrows(function () {
    resolver.resolve(deps);
  });
};

Tinytest.add("constraint solver - exact dependencies", function (test) {
  t_progagateExact({ "sparky-forms": "=1.1.2" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "forms": "=1.0.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "sparkle": "=2.1.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "awesome-dropdown": "=1.5.0" }, { "awesome-dropdown": "1.5.0", "dropdown": "1.2.2" });

  FAIL({ "sparky-forms": "=1.1.2", "sparkle": "=1.0.0" });
  // something that isn't available for your architecture
  FAIL({ "sparky-forms": "=1.1.2", "sparkle": "=2.0.0" });
  FAIL({ "sparky-forms": "=0.0.1" });
});

Tinytest.add("constraint solver - simple exact + regular deps", function (test) {
  t({ "sparky-forms": "=1.1.2" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2"
  });

  t({ "sparky-forms": "=1.1.2", "awesome-dropdown": "=1.5.0" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2",
    "awesome-dropdown": "1.5.0",
    "dropdown": "1.2.2"
  });
});

Tinytest.add("constraint solver - non-exact direct dependency", function (test) {
  // sparky-forms 1.0.0 won't be chosen because it depends on a very old
  // jquery, which is not compatible with the jquery that
  // awesome-dropdown uses.
  t({ "sparky-forms": "1.0.0", "awesome-dropdown": "=1.5.0" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2",
    "awesome-dropdown": "1.5.0",
    "dropdown": "1.2.2"
  });
});

Tinytest.add("constraint solver - no constraint dependency - anything", function (test) {
  var versions = resolver.resolve({ "sparkle": "none" });
  test.isTrue(_.isString(versions.sparkle));
  versions = resolver.resolve({ "sparkle": null });
  test.isTrue(_.isString(versions.sparkle));
});

Tinytest.add("constraint solver - no constraint dependency - transitive dep still picked right", function (test) {
  var versions = resolver.resolve({ "sparkle": "none", "sparky-forms": "1.1.2" });
  test.equal(versions.sparkle, "2.1.1");
  var versions = resolver.resolve({ "sparkle": null, "sparky-forms": "1.1.2" });
  test.equal(versions.sparkle, "2.1.1");
});
