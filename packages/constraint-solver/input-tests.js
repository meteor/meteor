var CS = ConstraintSolver;

// "Input tests" are the new style of tests that operate by creating a
// CS.Input (representing a problem statement) and passing it into
// CS.PackagesResolver.
// For tests of CS.Input serialization, see constraint-solver-tests.js.


// Yeah, we rely on object key order here.  Specifically that
// if you add a bunch of keys to an object (that look like package
// names) and then JSON.stringify the object, the keys will appear
// in that order.  If that's not true, these tests will break.
var sortKeys = function (obj) {
  var result = {};
  _.each(_.keys(obj).sort(), function (k) {
    result[k] = obj[k];
  });
  return result;
};
var formatSolution = function (obj) {
  // Note that we use JSON so that it's easy to copy-and-paste test
  // results into tests.
  return JSON.stringify({
    answer: sortKeys(obj.answer),
    allAnswers: obj.allAnswers && _.map(obj.allAnswers, sortKeys),
    neededToUseUnanticipatedPrereleases: obj.neededToUseUnanticipatedPrereleases
  }, null, 2);
};

var doTest = function (test, inputJSONable, outputJSONable, options) {
  var input;
  if (inputJSONable instanceof CS.Input) {
    input = inputJSONable;
  } else {
    input = CS.Input.fromJSONable(inputJSONable);
  }

  if (typeof outputJSONable.neededToUseUnanticipatedPrereleases !== 'boolean') {
    outputJSONable = _.extend(outputJSONable, {
      neededToUseUnanticipatedPrereleases: (
        !! outputJSONable.neededToUseUnanticipatedPrereleases)
    });
  }

  test.equal(
    formatSolution(CS.PackagesResolver._resolveWithInput(input, options)),
    formatSolution(outputJSONable));
};

var doFailTest = function (test, inputJSONable, messageExpect) {
  var input;
  if (inputJSONable instanceof CS.Input) {
    input = inputJSONable;
  } else {
    input = CS.Input.fromJSONable(inputJSONable);
  }

  test.throws(function () {
    try {
      CS.PackagesResolver._resolveWithInput(input);
    } catch (e) {
      if (! e.constraintSolverError) {
        test.fail(e.message);
      }
      throw e;
    }
  }, messageExpect);
};

Tinytest.add("constraint solver - input - upgrade indirect dependency", function (test) {
  doTest(test, {
    dependencies: ["foo"],
    constraints: [],
    previousSolution: { foo: "1.0.0", bar: "2.0.0" },
    upgrade: ["bar"],
    catalogCache: {
      data: {
        "foo 1.0.0": ["bar@2.0.0"],
        "bar 2.0.0": [],
        "bar 2.0.1": []
      }
    }
  }, {
    // if you specify an indirect dependency in `meteor update`,
    // it will get bumped up to a newer version
    answer: {
      foo: "1.0.0",
      bar: "2.0.1"
    }
  });
});

Tinytest.add("constraint solver - input - upgrade direct, don't break", function (test) {
  doTest(test, {
    dependencies: ["foo", "bar"],
    constraints: [],
    previousSolution: { foo: "1.0.0", bar: "2.0.0" },
    upgrade: ["bar"],
    catalogCache: {
      data: {
        "foo 1.0.0": ["bar@2.0.0||3.0.0"],
        "bar 2.0.0": [],
        "bar 3.0.0": []
      }
    }
  }, {
    answer: {
      foo: "1.0.0",
      bar: "2.0.0"
    }
  });

  // if allowIncompatibleUpdate is set, upgrade bar to 3.0.0
  doTest(test, {
    dependencies: ["foo", "bar"],
    constraints: [],
    previousSolution: { foo: "1.0.0", bar: "2.0.0" },
    upgrade: ["bar"],
    allowIncompatibleUpdate: true,
    catalogCache: {
      data: {
        "foo 1.0.0": ["bar@2.0.0||3.0.0"],
        "bar 2.0.0": [],
        "bar 3.0.0": []
      }
    }
  }, {
    answer: {
      foo: "1.0.0",
      bar: "3.0.0"
    }
  });
});

Tinytest.add("constraint solver - input - previous solution no patch", function (test) {
  doTest(test, {
    dependencies: ["foo"],
    constraints: [],
    previousSolution: { foo: "1.0.0", bar: "2.0.0" },
    catalogCache: {
      data: {
        "foo 1.0.0": ["bar@2.0.0"],
        "foo 1.0.1": ["bar@2.0.1"],
        "bar 2.0.0": [],
        "bar 2.0.1": []
      }
    }
  }, {
    answer: {
      foo: "1.0.0",
      bar: "2.0.0"
    }
  });
});


Tinytest.add("constraint solver - input - don't break root dep", function (test) {
  doTest(test, {
    dependencies: ["foo", "bar"],
    constraints: [],
    previousSolution: { bar: "2.0.0" },
    upgrade: [],
    catalogCache: {
      data: {
        "foo 1.0.0": ["bar@=2.0.1"],
        "bar 2.0.0": [],
        "bar 2.0.1": []
      }
    }
  }, {
    answer: {
      foo: "1.0.0",
      bar: "2.0.1"
    }
  });

  doFailTest(test, {
    dependencies: ["foo", "bar"],
    constraints: [],
    previousSolution: { bar: "2.0.1" },
    upgrade: [],
    catalogCache: {
      data: {
        "foo 1.0.0": ["bar@=2.0.0"],
        "bar 2.0.0": [],
        "bar 2.0.1": []
      }
    }
  }, 'Potentially incompatible change required to top-level dependency: bar 2.0.0, was 2.0.1.\nConstraints on package "bar":\n* bar@=2.0.0 <- foo 1.0.0\n\nTo allow potentially incompatible changes to top-level dependencies, you must pass --allow-incompatible-update on the command line.');
});

Tinytest.add("constraint solver - input - don't pick RCs", function (test) {
  // First verify that the solver takes the latest version when
  // presented with a new root dependency (i.e. one not mentioned in
  // a previous solution) -- and also that it will take a prerelease if
  // it has no choice.
  doTest(test, {
    dependencies: ["a"],
    constraints: [],
    catalogCache: {
      data: {
        "a 1.0.0-pre.0": [],
        "a 1.0.0-pre.1": []
      }
    }
  }, {
    answer: {
      a: "1.0.0-pre.1"
    },
    neededToUseUnanticipatedPrereleases: true
  });

  // If we have the option to take a non-pre-release version,
  // we should.
  doTest(test, {
    dependencies: ["a"],
    constraints: [],
    catalogCache: {
      data: {
        "a 0.9.0": [],
        "a 1.0.0-pre.0": [],
        "a 1.0.0-pre.1": []
      }
    }
  }, {
    answer: {
      a: "0.9.0"
    },
    neededToUseUnanticipatedPrereleases: false
  });

  // If the prerelease versions are "anticipated", take
  // the latest one.
  doTest(test, {
    dependencies: ["a"],
    constraints: [],
    anticipatedPrereleases: { a: {
      "1.0.0-pre.0": true, "1.0.0-pre.1": true } },
    catalogCache: {
      data: {
        "a 0.9.0": [],
        "a 1.0.0-pre.0": [],
        "a 1.0.0-pre.1": []
      }
    }
  }, {
    answer: {
      a: "1.0.0-pre.1"
    },
    neededToUseUnanticipatedPrereleases: false
  });

  // Don't take the unanticipated pre-releases here.
  doTest(test, {
    dependencies: ["a"],
    constraints: ["a@1.0.0"],
    catalogCache: {
      data: {
        "a 1.0.0": [],
        "a 1.0.1-pre.0": [],
        "a 1.0.1-pre.1": []
      }
    }
  }, {
    answer: {
      a: "1.0.0"
    },
    neededToUseUnanticipatedPrereleases: false
  });

  // If we ask for one prerelease, we might get another.
  // If it isn't anticipated, it sets the flag on the result
  // (differs from older behavior).
  doTest(test, {
    dependencies: ["a"],
    constraints: ["a@1.0.1-pre.0"],
    anticipatedPrereleases: { a: {
      "1.0.0-pre.0": true } },
    catalogCache: {
      data: {
        "a 1.0.0": [],
        "a 1.0.1-pre.0": [],
        "a 1.0.1-pre.1": []
      }
    }
  }, {
    answer: {
      a: "1.0.1-pre.1"
    },
    neededToUseUnanticipatedPrereleases: true
  });

});

Tinytest.add("constraint solver - input - previous solution no longer needed", function (test) {
  doTest(test, {
    dependencies: ["foo"],
    constraints: [],
    previousSolution: { foo: "1.0.0", bar: "1.0.0" },
    catalogCache: {
      data: {
        "foo 0.1.0": ["bar@1.0.0"],
        "foo 1.0.0": [],
        "bar 1.0.0": []
      }
    }
  }, {
    answer: {
      foo: "1.0.0"
    }
  });
});

Tinytest.add("constraint solver - input - conflicting top-level constraints", function (test) {
  // conflicting dependencies don't matter if we don't need the package
  doTest(test, {
    dependencies: [],
    constraints: ["foo@1.0.0", "foo@2.0.0"],
    previousSolution: {},
    catalogCache: {
      data: {
        "foo 1.0.0": [],
        "foo 2.0.0": []
      }
    }
  }, {
    answer: {
    }
  });

  // ... but they do if we do
  doFailTest(test, {
    dependencies: ["bar"],
    constraints: ["foo@1.0.0", "foo@2.0.0"],
    previousSolution: {},
    catalogCache: {
      data: {
        "foo 1.0.0": [],
        "foo 2.0.0": [],
        "bar 1.0.0": ["foo"]
      }
    }
  }, /No version of foo satisfies all constraints: @1.0.0, @2.0.0/);
});

Tinytest.add("constraint solver - input - previous indirect deps", function (test) {
  doTest(test, {
    dependencies: ["a"],
    constraints: [],
    previousSolution: { c: "1.2.3" },
    catalogCache: {
      data: {
        "a 1.0.0": ["b"],
        "b 1.0.0": ["c"],
        "c 1.0.0": [],
        "c 1.2.2": [],
        "c 1.2.3": [],
        "c 1.2.4": [],
        "c 1.3.0": [],
        "c 2.0.0": []
      }
    }
  }, {
    answer: {
      a: "1.0.0",
      b: "1.0.0",
      c: "1.2.3" // take same version as in previous solution
    }
  });
});

Tinytest.add("constraint solver - input - new indirect deps", function (test) {
  doTest(test, {
    dependencies: ["a"],
    constraints: [],
    previousSolution: {},
    catalogCache: {
      data: {
        "a 1.0.0": ["b"],
        "b 1.0.0": ["c@1.2.0"],
        "c 1.0.0": [],
        "c 1.2.2": [],
        "c 1.2.3": [],
        "c 1.2.4": [],
        "c 1.3.0": [],
        "c 2.0.0": []
      }
    }
  }, {
    answer: {
      a: "1.0.0",
      b: "1.0.0",
      c: "1.2.4" // take patches only (use oldest major/minor possible)
    }
  });
});

Tinytest.add("constraint solver - input - trade-off", function (test) {
  doTest(test, {
    dependencies: ["a"],
    constraints: [],
    previousSolution: { b: "1.0.0", c: "1.0.0" },
    catalogCache: {
      data: {
        "a 1.0.0": ["b", "c"],
        "b 1.0.0": ["x"],
        "b 1.0.1": ["y@1.0.0"],
        "b 1.0.2": ["y@2.0.0"],
        "c 1.0.0": ["x"],
        "c 1.0.1": ["y@2.0.0"],
        "c 1.0.2": ["x"],
        "c 1.0.3": ["y@1.0.0"],
        "y 1.0.0": [],
        "y 2.0.0": []
      }
    }
  }, {
    // given a choice between (b,c) being (1.0.1, 1.0.3) or (1.0.2, 1.0.1),
    // the latter should be preferred; indirect dependencies with a previous
    // solution should be jointly made as old as possible.
    answer: {
      a: "1.0.0",
      b: "1.0.2",
      c: "1.0.1",
      y: "2.0.0"
    }
  });

  doTest(test, {
    dependencies: ["a", "b", "c"],
    constraints: [],
    previousSolution: {},
    catalogCache: {
      data: {
        "a 1.0.0": ["b", "c"],
        "b 1.0.0": ["x"],
        "b 1.0.1": ["y@1.0.0"],
        "b 1.0.2": ["y@2.0.0"],
        "c 1.0.0": ["x"],
        "c 1.0.1": ["y@2.0.0"],
        "c 1.0.2": ["x"],
        "c 1.0.3": ["y@1.0.0"],
        "y 1.0.0": [],
        "y 2.0.0": []
      }
    }
  }, {
    // now we should prefer "b" and "c" to jointly be as new as possible,
    // because they are direct dependencies with no previous solution.
    answer: {
      a: "1.0.0",
      b: "1.0.1",
      c: "1.0.3",
      y: "1.0.0"
    }
  });

});

Tinytest.add("constraint solver - input - fake PackageConstraint", function (test) {
  // The tool gives us PackageConstraint objects constructed with a different
  // copy of package-version-parser.  If we're not careful in CS.Input or
  // CS.Solver, this case will throw an error.  See comments in CS.Input.
  var fakeConstraint = new (function () {});
  fakeConstraint.package = 'foo';
  fakeConstraint.constraintString = '2.0.0';
  fakeConstraint.toString = function () {
    return 'foo@2.0.0';
  };
  fakeConstraint.versionConstraint = new (function () {});
  fakeConstraint.versionConstraint.raw = '2.0.0';
  fakeConstraint.versionConstraint.alternatives = [
    {type: 'compatible-with', versionString: '2.0.0' }
  ];
  fakeConstraint.versionConstraint.toString = function () {
    return '2.0.0';
  };

  doFailTest(test,
             new CS.Input(["foo", "bar"], [fakeConstraint],
                          CS.CatalogCache.fromJSONable({
                            data: {
                              "foo 1.0.0": [],
                              "foo 2.0.0": [],
                              "bar 1.0.0": ["foo@1.0.0"]
                            }
                          })),
             /Constraint foo@1.0.0 is not satisfied by foo 2.0.0/);
});

Tinytest.add("constraint solver - input - stack overflow bug", function (test) {
  // This case is taken from the "solver-error" branch of the meteor/rectangles
  // repo.  It's an app running from a release (new-version-solver-2) with an
  // unsatisfiable constraint in .meteor/packages.  It caused a stack overflow
  // before logic-solver got smarter about avoiding recursion in formula
  // generation, and it also tests the case where an unsatisfiable constraint is
  // in .meteor/packages.
  //
  // It's not actually a good test of logic-solver overflowing the stack anymore,
  // because the constraint-solver is smarter now.
  doFailTest(test, STACK_OVERFLOW_BUG_INPUT,
             /No version of follower-livedata satisfies all constraints: @0.9.0/);
});


Tinytest.add("constraint solver - input - bad package name", function (test) {
  test.throws(function () {
    new CS.Input(['-x'], [], new CS.CatalogCache());
  }, /may not begin with a hyphen/);

  test.throws(function () {
    new CS.Input([], [], new CS.CatalogCache(),
                 { previousSolution: { $a: '1.0.0' } });
  }, /Package names can only contain/);

  test.throws(function () {
    new CS.Input([], [], new CS.CatalogCache(),
                 { upgrade: ['$a'] });
  }, /Package names can only contain/);

  test.throws(function () {
    new CS.Input([], [], new CS.CatalogCache(),
                 { upgrade: ['-a'] });
  }, /may not begin with a hyphen/);
});


Tinytest.add("constraint solver - input - slow solve", function (test) {
  var input = CS.Input.fromJSONable(SLOW_TEST_DATA);

  test.equal(
    formatSolution(CS.PackagesResolver._resolveWithInput(input)),
    formatSolution({
      "answer":{
        "autopublish":"1.0.2",
        "u2622:persistent-session":"0.2.1",
        "blaze":"2.0.4",
        "random":"1.0.2",
        "mobile-status-bar":"1.0.2",
        "deps":"1.0.6",
        "follower-livedata":"1.0.3",
        "spacebars":"1.0.4",
        "spacebars-compiler":"1.0.4",
        "launch-screen":"1.0.1",
        "iron:location":"1.0.6",
        "http":"1.0.9",
        "json":"1.0.2",
        "check":"1.0.3",
        "retry":"1.0.2",
        "id-map":"1.0.2",
        "reactive-dict":"1.0.5",
        "mrt:moment":"2.8.1",
        "callback-hook":"1.0.2",
        "meteor":"1.1.4",
        "fastclick":"1.0.2",
        "minifiers":"1.1.3",
        "mrt:jquery-ui-sortable":"1.10.3",
        "webapp":"1.1.5",
        "ejson":"1.0.5",
        "skinnygeek1010:parse-form":"0.2.1",
        "iron:controller":"1.0.6",
        "base64":"1.0.2",
        "url":"1.0.3",
        "blaze-tools":"1.0.2",
        "ddp":"1.0.13",
        "iron:core":"1.0.6",
        "splendido:accounts-templates-semantic-ui":"0.0.4",
        "observe-sequence":"1.0.4",
        "reactive-var":"1.0.4",
        "webapp-hashing":"1.0.2",
        "mongo":"1.0.11",
        "htmljs":"1.0.3",
        "ui":"1.0.5",
        "amplify":"1.0.0",
        "meteor-platform":"1.2.1",
        "ordered-dict":"1.0.2",
        "session":"1.0.5",
        "livedata":"1.0.12",
        "templating":"1.0.10",
        "binary-heap":"1.0.2",
        "mizzao:timesync":"0.2.2",
        "tracker":"1.0.4",
        "autoupdate":"1.1.4",
        "html-tools":"1.0.3",
        "reload":"1.1.2",
        "less":"1.0.12",
        "application-configuration":"1.0.4",
        "gfk:notifications":"1.1.1",
        "underscore":"1.0.2",
        "iron:dynamic-template":"1.0.6",
        "routepolicy":"1.0.3",
        "iron:router":"1.0.6",
        "insecure":"1.0.2",
        "iron:layout":"1.0.6",
        "geojson-utils":"1.0.2",
        "minimongo":"1.0.6",
        "iron:url":"1.0.6",
        "jquery":"1.11.2",
        "boilerplate-generator":"1.0.2",
        "iron:middleware-stack":"1.0.6",
        "logging":"1.0.6"
      },
      "neededToUseUnanticipatedPrereleases":false
    }));
});

Tinytest.add("constraint solver - input - update unknown", function (test) {
  // trying to update an unknown package is currently not an error
  // at the CS.Input level.  It IS an error in the tool, so this case
  // won't make it through in actual tool usage.
  doTest(test, {
    dependencies: ["direct"],
    constraints: [],
    previousSolution: {
      direct: "1.0.0"
    },
    upgrade: ["unknown"],
    catalogCache: {
      data: {
        "direct 1.0.0": []
      }
    }
  }, {
    answer: {
      direct: "1.0.0"
    }
  });
});

Tinytest.add("constraint solver - input - update indirect deps", function (test) {
  // test upgrading an indirect dependency explicitly.
  // `meteor update indirect` takes it from 1.0.0 to 2.0.0 (with no concern
  // about bumping the major version because it's not a top-level package,
  // and the only package that uses it doesn't specify any constraint).
  doTest(test, {
    dependencies: ["direct"],
    constraints: [],
    previousSolution: {
      direct: "1.0.0",
      indirect: "1.0.0"
    },
    upgrade: ["indirect"],
    catalogCache: {
      data: {
        "direct 1.0.0": ["indirect"],
        "indirect 1.0.0": [],
        "indirect 2.0.0": []
      }
    }
  }, {
    answer: {
      direct: "1.0.0",
      indirect: "2.0.0"
    }
  });

  // Normally, we don't take patches to indirect dependencies, even when
  // updating direct dependencies.  This is what would happen if the user
  // typed `meteor update direct`.
  doTest(test, {
    dependencies: ["direct"],
    constraints: [],
    previousSolution: {
      direct: "1.0.0",
      indirect: "1.0.0"
    },
    upgrade: ["direct"],
    catalogCache: {
      data: {
        "direct 1.0.0": ["indirect"],
        "direct 1.5.0": ["indirect"],
        "direct 2.0.0": ["indirect"],
        "indirect 1.0.0": [],
        "indirect 1.0.1": [],
        "indirect 1.1.0": []
      }
    }
  }, {
    answer: {
      direct: "1.5.0", // upgraded (but not to higher major version)
      indirect: "1.0.0" // not upgraded
    }
  });

  // If upgradeIndirectDepPatchVersions is true, user just typed
  // `meteor update`.  Take the opportunity to take patches to indirect
  // dependencies.
  doTest(test, {
    dependencies: ["direct"],
    constraints: [],
    previousSolution: {
      direct: "1.0.0",
      indirect: "1.0.0",
      indirect2: "1.0.0"
    },
    upgrade: ["direct"],
    upgradeIndirectDepPatchVersions: true,
    catalogCache: {
      data: {
        "direct 1.0.0": ["indirect"],
        "direct 1.5.0": ["indirect", "indirect2"],
        "direct 2.0.0": ["indirect"],
        "indirect 1.0.0": [],
        "indirect 1.0.0_1": [],
        "indirect 1.0.1": [],
        "indirect 1.1.0": [],
        "indirect2 1.0.0": [],
        "indirect2 1.0.0_1": [],
        "indirect2 1.0.0_2": [],
        "indirect2 1.1.0": []
      }
    }
  }, {
    answer: {
      direct: "1.5.0", // upgraded (but not to higher major version)
      indirect: "1.0.1", // patch/wrapNum upgraded to latest
      indirect2: "1.0.0_2" // patch/wrapNum upgraded to latest
    }
  });
});

Tinytest.add("constraint solver - input - package is only weak dep", function (test) {
  doTest(test, {
    dependencies: ["foo"],
    constraints: [],
    previousSolution: {},
    catalogCache: {
      data: {
        "foo 1.0.0": ["?bar"]
      }
    }
  }, {
    answer: {
      foo: "1.0.0"
    }
  });
});
