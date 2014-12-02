
var makeResolver = function (data) {
  var Versions = new LocalCollection;

  _.each(data, function (versionDescription) {
    var packageName = versionDescription.shift();
    var version = versionDescription.shift();
    var deps = versionDescription.shift();

    var constructedDeps = {};
    _.each(deps, function (constraint, name) {
      constructedDeps[name] = {
        constraint: constraint,
        references: [
          { arch: "os" },
          { arch: "web.browser"},
          { arch: "web.cordova"}
        ]
      };
    });
    Versions.insert({ packageName: packageName, version: version,
                      dependencies: constructedDeps });
  });

  var catalogStub = {
    getSortedVersionRecords: function (name) {
      var records = Versions.find({packageName: name}).fetch();
      records.sort(function (a, b) {
        return PackageVersion.compare(a.version, b.version);
      });
      return records;
    }
  };
  return new ConstraintSolver.PackagesResolver(catalogStub);
};

var defaultResolver = makeResolver([
  ["sparky-forms", "1.1.2", {"forms": "=1.0.1", "sparkle": "=2.1.1"}],
  ["sparky-forms", "1.0.0", {"awesome-dropdown": "=1.4.0"}],
  ["forms", "1.0.1", {"sparkle": "2.1.0", "jquery-widgets": "1.0.0"}],
  ["sparkle", "2.1.0", {"jquery": "1.8.2"}],
  ["sparkle", "2.1.1", {"jquery": "1.8.2"}],
  ["sparkle", "1.0.0"],
  ["awesome-dropdown", "1.4.0", {"dropdown": "=1.2.2"}],
  ["awesome-dropdown", "1.5.0", {"dropdown": "=1.2.2"}],
  ["dropdown", "1.2.2", {"jquery-widgets": "1.0.0"}],
  ["jquery-widgets", "1.0.0", {"jquery": "1.8.0", "sparkle": "2.1.1"}],
  ["jquery-widgets", "1.0.2", {"jquery": "1.8.0", "sparkle": "2.1.1"}],
  ["jquery", "1.8.0"],
  ["jquery", "1.8.2"]
]);

// Take a map of `{ dependency: constraint }`, where `dependency`
// is a package name string and `constraint` is a constraint string,
// and return an array of dependencies (package name strings)
// and an array of constraint objects.
//
// If a constraint is prefixed with 'w', the dependency is a weak
// dependency, so it will generate a constraint but not a dependency
// in the returned arrays.
splitArgs = function (deps) {
  var dependencies = [], constraints = [];

  _.each(deps, function (constr, dep) {
    if (constr && constr.charAt(0) === 'w') {
      constr = constr.slice(1);
    } else {
      dependencies.push(dep);
    }
    if (constr) {
      constraints.push(PackageVersion.parseConstraint(dep + "@" + constr));
    }
  });
  return {dependencies: dependencies, constraints: constraints};
};

var testWithResolver = function (test, resolver, f) {
  var t = function (deps, expected, options) {
    var dependencies = splitArgs(deps).dependencies;
    var constraints = splitArgs(deps).constraints;

    var resolvedDeps = resolver.resolve(dependencies, constraints, options);
    test.equal(resolvedDeps.answer, expected);
  };

  var FAIL = function (deps, regexp) {
    test.throws(function () {
      var dependencies = splitArgs(deps).dependencies;
      var constraints = splitArgs(deps).constraints;

      var resolvedDeps = resolver.resolve(dependencies, constraints,
                                          {_testing: true});
    }, regexp);
  };
  f(t, FAIL);
};

Tinytest.add("constraint solver - simple exact + regular deps", function (test) {
  testWithResolver(test, defaultResolver, function (t) {
    t({ "sparky-forms": "=1.1.2" }, {
      "sparky-forms": "1.1.2",
      "forms": "1.0.1",
      "sparkle": "2.1.1",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2"
    }, { _testing: true });

    t({ "sparky-forms": "=1.1.2", "awesome-dropdown": "=1.5.0" }, {
      "sparky-forms": "1.1.2",
      "forms": "1.0.1",
      "sparkle": "2.1.1",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2",
      "awesome-dropdown": "1.5.0",
      "dropdown": "1.2.2"
    }, { _testing: true });
  });
});


Tinytest.add("constraint solver - non-exact direct dependency", function (test) {
  testWithResolver(test, defaultResolver, function (t) {
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
    }, { _testing: true });
  });
});

Tinytest.add("constraint solver - no results", function (test) {
  var resolver = makeResolver([
    ["bad-1", "1.0.0", {indirect: "1.0.0"}],
    ["bad-2", "1.0.0", {indirect: "2.0.0"}],
    ["indirect", "1.0.0"],
    ["indirect", "2.0.0"]
  ]);
  testWithResolver(test, resolver, function (t, FAIL) {
    FAIL({ "bad-1": "1.0.0", "bad-2": "" }, function (error) {
      return error.message.match(/indirect@2\.0\.0 is not satisfied by 1\.0\.0/)
        && error.message.match(/bad-1@1\.0\.0/)
        && error.message.match(/bad-2@1\.0\.0/)
        // We shouldn't get shown indirect itself in a pathway: that would just
        // be an artifact of there being a path that passes through another
        // package.  (Note: we might change our mind and decide that all these
        // lines should end in the relevant constraint, which would probably be
        // nice! But in that case, we should test that no line ends with TWO
        // mentions of indirect.)
        && ! error.message.match(/-> indirect/)
        // Lines should be unique.
        && ! error.message.match(/bad-1[^]+bad-1/);
    });
  });

  resolver = makeResolver([
    ["foo", "1.0.0"],
    ["foo", "1.1.0"],
    ["foo", "2.0.0"],
    ["foo", "2.1.0"],
    ["bar", "1.0.0", {foo: "1.0.0"}]
  ]);
  testWithResolver(test, resolver, function (t, FAIL) {
    FAIL({foo: "2.0.0", bar: "1.0.0"},
         /constraints on foo[^]+top level[^]+bar@1.0.0/);
  });

  testWithResolver(test, makeResolver([]), function (t, FAIL) {
    FAIL({foo: "1.0.0"}, /unknown package: foo/);
  });

  resolver = makeResolver([
    ["foo", "2.0.0"],
    ["bar", "1.0.0", {foo: ""}]
  ]);
  testWithResolver(test, resolver, function (t, FAIL) {
    FAIL({foo: "w1.0.0", bar: "1.0.0"},
         /constraints on foo[^]+top level/);
  });
});


Tinytest.add("constraint solver - any-of constraint", function (test) {
  var resolver = makeResolver([
    ["one-of", "1.0.0", {indirect: "1.0.0 || 2.0.0"}],
    ["important", "1.0.0", {indirect: "2.0.0"}],
    ["indirect", "1.0.0"],
    ["indirect", "2.0.0"]
  ]);

  testWithResolver(test, resolver, function (t, FAIL) {
    t({ "one-of": "=1.0.0", "important": "1.0.0" }, {
      "one-of": "1.0.0",
      "important": "1.0.0",
      "indirect": "2.0.0"
    }, { _testing: true });
  });

  resolver = makeResolver([
    ["one-of", "1.0.0", {indirect: "1.0.0 || 2.0.0"}],
    ["one-of-equal", "1.0.0", {indirect: "1.0.0 || =2.0.1"}],
    ["important", "1.0.0", {indirect: "1.0.0"}],
    ["indirect", "1.0.0"],
    ["indirect", "2.0.0"],
    ["indirect", "2.0.1"]
  ]);

  testWithResolver(test, resolver, function (t, FAIL) {
    t({ "one-of": "=1.0.0", "important": "1.0.0" }, {
      "one-of": "1.0.0",
      "important": "1.0.0",
      "indirect": "1.0.0"
    }, { _testing: true });

    t({ "one-of-equal": "1.0.0", "indirect": "2.0.0" }, {
      "one-of-equal": "1.0.0",
      "indirect": "2.0.1"
    }, { _testing: true });

    t({ "one-of-equal": "1.0.0", "one-of": "1.0.0" }, {
      "one-of-equal": "1.0.0",
      "one-of": "1.0.0",
      "indirect": "1.0.0"
    }, { _testing: true });

    FAIL({"one-of-equal": "1.0.0",
          "one-of": "1.0.0",
          "indirect" : "=2.0.0"},
         /constraints on indirect[^]+top level[^]+one-of-equal@1.0.0/
    );
  });
});

Tinytest.add("constraint solver - previousSolution", function (test) {
  testWithResolver(test, defaultResolver, function (t, FAIL) {
    // This is what you get if you lock sparky-forms to 1.0.0.
    t({ "sparky-forms": "=1.0.0" }, {
      "sparky-forms": "1.0.0",
      "awesome-dropdown": "1.4.0",
      "dropdown": "1.2.2",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2",
      "sparkle": "2.1.1"
    }, { _testing: true });

    // If you just requires something compatible with 1.0.0, we end up choosing
    // 1.1.2.
    t({ "sparky-forms": "1.0.0" }, {
      "sparky-forms": "1.1.2",
      "forms": "1.0.1",
      "sparkle": "2.1.1",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2"
    }, { _testing: true });

    // But if you ask for something compatible with 1.0.0 and have a previous
    // solution with 1.0.0, the previous solution works (since it is achievable).
    t({ "sparky-forms": "1.0.0" }, {
      "sparky-forms": "1.0.0",
      "awesome-dropdown": "1.4.0",
      "dropdown": "1.2.2",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2",
      "sparkle": "2.1.1"
    }, { _testing: true, previousSolution: {
      "sparky-forms": "1.0.0"
    }});

    // On the other hand, if the previous solution is incompatible with the
    // constraints, it's not an error: we can try something that isn't the
    // previous solution in this case!
    t({ "sparky-forms": "1.1.2" }, {
      "sparky-forms": "1.1.2",
      "forms": "1.0.1",
      "sparkle": "2.1.1",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2"
    }, { _testing: true, previousSolution: {
      "sparky-forms": "1.0.0"
    }});
  });
});


Tinytest.add("constraint solver - no constraint dependency - anything", function (test) {
  var versions = defaultResolver.resolve(["sparkle"], [], { _testing: true }).answer;
  test.isTrue(_.isString(versions.sparkle));
});


Tinytest.add("constraint solver - no constraint dependency - transitive dep still picked right", function (test) {
  var versions = defaultResolver.resolve(
    ["sparkle", "sparky-forms"],
    [PackageVersion.parseConstraint("sparky-forms@1.1.2")],
    { _testing: true }).answer;
  test.equal(versions.sparkle, "2.1.1");
});

Tinytest.add("constraint solver - build IDs", function (test) {
  // build IDs in suffixes like "+local" don't show up in output
  testWithResolver(test, makeResolver([
    ["foo", "1.0.1+local"]
  ]), function (t) {
    t({ "foo": "1.0.0" }, {
      "foo": "1.0.1"
    }, { _testing: false });
  });
});
