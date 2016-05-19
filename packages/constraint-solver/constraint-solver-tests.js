var PV = PackageVersion;
var CS = ConstraintSolver;

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
        return PV.compare(a.version, b.version);
      });
      return records;
    }
  };
  return new CS.PackagesResolver(catalogStub);
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
      constraints.push(PV.parsePackageConstraint(dep + "@" + constr));
    }
  });
  return {dependencies: dependencies, constraints: constraints};
};

var testWithResolver = function (test, resolver, f) {
  var answerToString = function (answer) {
    var pvs = _.map(answer, function (v, p) { return p + ' ' + v; });
    return pvs.sort().join('\n');
  };
  var t = function (deps, expected, options) {
    var dependencies = splitArgs(deps).dependencies;
    var constraints = splitArgs(deps).constraints;

    var resolvedDeps = resolver.resolve(dependencies, constraints, options);
    test.equal(answerToString(resolvedDeps.answer),
               answerToString(expected));
  };

  var FAIL = function (deps, regexp) {
    test.throws(function () {
      var dependencies = splitArgs(deps).dependencies;
      var constraints = splitArgs(deps).constraints;

      var resolvedDeps = resolver.resolve(dependencies, constraints);
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
      "jquery-widgets": "1.0.2",
      "jquery": "1.8.2"
    });

    t({ "sparky-forms": "=1.1.2", "awesome-dropdown": "=1.5.0" }, {
      "sparky-forms": "1.1.2",
      "forms": "1.0.1",
      "sparkle": "2.1.1",
      "jquery-widgets": "1.0.2",
      "jquery": "1.8.2",
      "awesome-dropdown": "1.5.0",
      "dropdown": "1.2.2"
    });
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
      "jquery-widgets": "1.0.2",
      "jquery": "1.8.2",
      "awesome-dropdown": "1.5.0",
      "dropdown": "1.2.2"
    });
  });
});

Tinytest.add("constraint solver - no results", function (test) {
  var resolver = makeResolver([
    ["bad-1", "1.0.0", {indirect: "1.0.0"}],
    ["bad-2", "1.0.0", {indirect: "2.0.0"}],
    ["indirect", "1.0.0"],
    ["indirect", "2.0.0"],
    ["mytoplevel", "1.0.0", {"bad-1": "1.0.0", "bad-2": ""}]
  ]);
  testWithResolver(test, resolver, function (t, FAIL) {
    FAIL({ "mytoplevel": "" }, function (error) {
      return error.message.match(/indirect@2\.0\.0 is not satisfied by indirect 1\.0\.0/)
        && error.message.match(/^\* indirect@1\.0\.0 <- bad-1 1\.0\.0 <- mytoplevel 1.0.0$/m)
        && error.message.match(/^\* indirect@2\.0\.0 <- bad-2 1\.0\.0 <- mytoplevel 1.0.0$/m)
      // Lines should be unique.
        && ! error.message.match(/bad-1[^]+bad-1/)
      // only two constraints listed
        && ! error.message.match(/onstraints on package "foo":[^]+@[^]+@[^]+@/);
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
    FAIL({foo: "2.0.0", bar: "1.0.0"}, function (error) {
      return error.message.match(/Constraints on package "foo":[^]+top level/) &&
        error.message.match(/Constraints on package "foo":[^]+bar 1.0.0/);
    });
  });

  testWithResolver(test, makeResolver([]), function (t, FAIL) {
    FAIL({foo: "1.0.0"}, /unknown package in top-level dependencies: foo/);
  });

  resolver = makeResolver([
    ["foo", "2.0.0"],
    ["bar", "1.0.0", {foo: ""}]
  ]);
  testWithResolver(test, resolver, function (t, FAIL) {
    FAIL({foo: "w1.0.0", bar: "1.0.0"},
         /No version of foo satisfies all constraints: @1.0.0/);
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
    });
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
    });

    t({ "one-of-equal": "1.0.0", "indirect": "2.0.0" }, {
      "one-of-equal": "1.0.0",
      "indirect": "2.0.1"
    });

    t({ "one-of-equal": "1.0.0", "one-of": "1.0.0" }, {
      "one-of-equal": "1.0.0",
      "one-of": "1.0.0",
      "indirect": "1.0.0"
    });

    FAIL({"one-of-equal": "1.0.0",
          "one-of": "1.0.0",
          "indirect" : "=2.0.0"}, function (error) {
            return error.message.match(/Constraints on package "indirect":[^]+top level/) &&
              error.message.match(/Constraints on package "indirect":[^]+one-of-equal 1.0.0/);
          });
  });
});

Tinytest.add("constraint solver - previousSolution", function (test) {
  testWithResolver(test, defaultResolver, function (t, FAIL) {
    // This is what you get if you lock sparky-forms to 1.0.0.
    t({ "sparky-forms": "=1.0.0" }, {
      "sparky-forms": "1.0.0",
      "awesome-dropdown": "1.4.0",
      "dropdown": "1.2.2",
      "jquery-widgets": "1.0.2",
      "jquery": "1.8.2",
      "sparkle": "2.1.1"
    });

    // If you just requires something compatible with 1.0.0, we end up choosing
    // 1.1.2.
    t({ "sparky-forms": "1.0.0" }, {
      "sparky-forms": "1.1.2",
      "forms": "1.0.1",
      "sparkle": "2.1.1",
      "jquery-widgets": "1.0.2",
      "jquery": "1.8.2"
    });

    // But if you ask for something compatible with 1.0.0 and have a previous
    // solution with 1.0.0, the previous solution works (since it is achievable).
    t({ "sparky-forms": "1.0.0" }, {
      "sparky-forms": "1.0.0",
      "awesome-dropdown": "1.4.0",
      "dropdown": "1.2.2",
      "jquery-widgets": "1.0.2",
      "jquery": "1.8.2",
      "sparkle": "2.1.1"
    }, { previousSolution: {
      "sparky-forms": "1.0.0"
    }});

    // On the other hand, if the previous solution is incompatible with the
    // constraints, it's not an error: we can try something that isn't the
    // previous solution in this case!
    t({ "sparky-forms": "1.1.2" }, {
      "sparky-forms": "1.1.2",
      "forms": "1.0.1",
      "sparkle": "2.1.1",
      "jquery-widgets": "1.0.2",
      "jquery": "1.8.2"
    }, { previousSolution: {
      "sparky-forms": "1.0.0"
    }});
  });
});


Tinytest.add("constraint solver - no constraint dependency - anything", function (test) {
  var versions = defaultResolver.resolve(["sparkle"], []).answer;
  test.isTrue(_.isString(versions.sparkle));
});


Tinytest.add("constraint solver - no constraint dependency - transitive dep still picked right", function (test) {
  var versions = defaultResolver.resolve(
    ["sparkle", "sparky-forms"],
    [PV.parsePackageConstraint("sparky-forms@1.1.2")]).answer;
  test.equal(versions.sparkle, "2.1.1");
});

Tinytest.add("constraint solver - input serialization", function (test) {
  var json = '{"dependencies":["sparky-forms"],"constraints":["sparky-forms@1.0.0"],"catalogCache":{"data":{"sparky-forms 1.0.0":["awesome-dropdown@=1.4.0"],"sparky-forms 1.1.2":["forms@=1.0.1","sparkle@=2.1.1"],"sparkle 1.0.0":[],"sparkle 2.1.0":["jquery@1.8.2"],"sparkle 2.1.1":["jquery@1.8.2"],"jquery 1.8.0":[],"jquery 1.8.2":[],"forms 1.0.1":["sparkle@2.1.0","jquery-widgets@1.0.0"],"jquery-widgets 1.0.0":["jquery@1.8.0","sparkle@2.1.1"],"jquery-widgets 1.0.2":["jquery@1.8.0","sparkle@2.1.1"],"awesome-dropdown 1.4.0":["dropdown@=1.2.2"],"awesome-dropdown 1.5.0":["dropdown@=1.2.2"],"dropdown 1.2.2":["jquery-widgets@1.0.0"]}}}';

  var input1 = CS.Input.fromJSONable(JSON.parse(json));

  test.equal(input1.dependencies, ["sparky-forms"]);
  test.isTrue(input1.constraints[0] instanceof PV.PackageConstraint);
  test.equal(input1.constraints.toString(), "sparky-forms@1.0.0");
  test.isTrue(input1.catalogCache instanceof CS.CatalogCache);
  test.equal(input1.upgrade, []);
  test.equal(input1.anticipatedPrereleases, {});
  test.equal(input1.previousSolution, null);
  test.equal(input1.allowIncompatibleUpdate, false);
  test.equal(input1.upgradeIndirectDepPatchVersions, false);

  var obj1 = input1.toJSONable();
  test.isFalse(_.has(obj1, 'upgrade'));
  test.isFalse(_.has(obj1, 'anticipatedPrereleases'));
  test.isFalse(_.has(obj1, 'previousSolution'));
  var input2 = CS.Input.fromJSONable(obj1);
  var obj2 = input2.toJSONable();

  test.equal(JSON.stringify(obj1), json);
  test.equal(JSON.stringify(obj2), json);

  ///// Now a different case:

  var input2 = new CS.Input(
    ['foo'], [PV.parsePackageConstraint('foo@1.0.0')],
    new CS.CatalogCache(), {
      upgrade: ['foo'],
      anticipatedPrereleases: { foo: { '1.0.0-rc.0': true } },
      previousSolution: { foo: '1.0.0' },
      allowIncompatibleUpdate: true,
      upgradeIndirectDepPatchVersions: true
    });

  var json2 = JSON.stringify(input2.toJSONable());
  var input2prime = CS.Input.fromJSONable(JSON.parse(json2));
  test.equal(input2prime.toJSONable(), {
    dependencies: ["foo"],
    constraints: ["foo@1.0.0"],
    catalogCache: { data: {} },
    upgrade: ['foo'],
    anticipatedPrereleases: { foo: { '1.0.0-rc.0': true } },
    previousSolution: { foo: '1.0.0' },
    allowIncompatibleUpdate: true,
    upgradeIndirectDepPatchVersions: true
  });
});

Tinytest.add("constraint solver - non-existent indirect package", function (test) {
  var resolver = makeResolver([
    ["foo", "1.0.0", {bar: "1.0.0"}]
  ]);
  testWithResolver(test, resolver, function (t, FAIL) {
    FAIL({ "foo": "1.0.0" }, function (error) {
      return error.message.match(/unknown package: bar/);
    });
  });
});
