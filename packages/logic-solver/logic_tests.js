
Tinytest.add("logic-solver - require", function (test) {
  var s = new Logic.Solver;

  s.require('foo');
  test.equal(s._clauseData(), [[3]]);
  test.equal(s._clauseStrings(), ["foo"]);
  s.forbid('foo');
  test.equal(s._clauseData(), [[3], [-3]]);
  test.equal(s._clauseStrings(), ["foo", "-foo"]);

  s.require([['foo'], '-bar'], '--foo', 'foo');
  test.equal(s._clauseData(), [[3], [-3], [3], [-4], [3], [3]]);
  test.equal(s._clauseStrings(), ["foo", "-foo", "foo",
                                  "-bar", "foo", "foo"]);
});

Tinytest.add("logic-solver - _clauseStrings", function (test) {
  var s = new Logic.Solver;

  s.require('foo');

  test.equal(s._clauseStrings(), ["foo"]);
  s.require('-myPackage 1.0.0');
  test.equal(s._clauseStrings(), ["foo", '-"myPackage 1.0.0"']);
});

Tinytest.add("logic-solver - toNameTerm, toNumTerm", function (test) {
  var s = new Logic.Solver;

  test.equal(s.toNumTerm("foo"), 3);
  test.equal(s.toNumTerm("-foo"), -3);
  test.equal(s.toNumTerm(["foo", "-bar"]), [3, -4]);

  test.equal(s.toNameTerm(3), "foo");
  test.equal(s.toNameTerm(-3), "-foo");
  test.equal(s.toNameTerm([3, -4]), ["foo", "-bar"]);

  test.equal(s.toNameTerm("-----foo"), "-foo");
});

var checkClauses = function (test, f, expected) {
  check(f, Function);
  check(expected, [String]);
  var s = new Logic.Solver;
  f(s);
  test.equal(s._clauseStrings().join('\n'), expected.join('\n'));
};

var runClauseTests = function (test, funcsAndExpecteds) {
  check(funcsAndExpecteds.length % 2, 0);
  for (var i = 0; i < funcsAndExpecteds.length; i++) {
    var f = funcsAndExpecteds[i];
    i++;
    var expected = funcsAndExpecteds[i];
    checkClauses(test, f, expected);
  }
};

Tinytest.add("logic-solver - bad NumTerms", function (test) {
  test.throws(function () {
    var s = new Logic.Solver;
    s.require(3);
  });

  test.throws(function () {
    var s = new Logic.Solver;
    s.require(-3);
  });

  test.throws(function () {
    var s = new Logic.Solver;
    s.require(0);
  });

  test.throws(function () {
    var s = new Logic.Solver;
    s.require(Logic.or(3));
  });
});

Tinytest.add("logic-solver - true and false", function (test) {
  runClauseTests(test, [
    // Clauses that forbid $F and require $T are automatically
    // generated as the first two clauses.  Using each of them
    // causes the relevant clause to be included in the output.
    function (s) {
      s.require(Logic.or(Logic.TRUE, Logic.not(Logic.TRUE)));
    },
    ["$T", "$T v -$T"],
    function (s) {
      s.require(Logic.or(Logic.not(Logic.TRUE),
                         Logic.not(Logic.FALSE)));
    },
    ["-$F", "$T", "-$T v -$F"],
    // requiring or forbidding $T, $F, or the negation of one
    // of those is optimizated.  this is helpful when formulas
    // expand to one of these (e.g. Logic.and() => $T => []).
    function (s) { s.require(Logic.TRUE); }, [],
    function (s) { s.require(Logic.FALSE); }, [""],
    function (s) { s.require(Logic.not(Logic.TRUE)); }, [""],
    function (s) { s.require(Logic.not(Logic.FALSE)); }, [],
    function (s) { s.forbid(Logic.TRUE); }, [""],
    function (s) { s.forbid(Logic.FALSE); }, [],
    function (s) { s.forbid(Logic.not(Logic.TRUE)); }, [],
    function (s) { s.forbid(Logic.not(Logic.FALSE)); }, [""]
  ]);
});

Tinytest.add("logic-solver - Logic.or", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.or('A', 'B'));
    },
    ["A v B"],
    function (s) {
      s.require(Logic.or(['A', 'B']));
    },
    ["A v B"],
    function (s) {
      s.require(Logic.or(['A'], ['B']));
    },
    ["A v B"],
    function (s) {
      s.require('A');
      s.require(Logic.or('-C', 'D', 3));
    },
    ["A", "-C v D v A"],
    function (s) {
      s.forbid(Logic.or('A', '-B'));
    },
    ["-A", "B"],
    function (s) {
      s.forbid(Logic.or());
    },
    [],
    function (s) {
      s.require(Logic.or());
    },
    [""]
  ]);
});

Tinytest.add("logic-solver - Formula sharing", function (test) {
  var f = Logic.or("A", "B");
  var s1 = new Logic.Solver;
  var s2 = new Logic.Solver;

  s1.require("X");
  s1.require(f);

  s2.forbid(f);

  test.equal(s1._clauseData(), [[3], [4, 5]]);
  test.equal(s2._clauseData(), [[-3], [-4]]);
});

Tinytest.add("logic-solver - nested Logic.or", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.or(Logic.or("A", "B"), Logic.or("C", "D")));
    },
    ["A v B v -$or1", "C v D v -$or2", "$or1 v $or2"]
  ]);
});

Tinytest.add("logic-solver - Logic.not term", function (test) {
  test.equal(Logic.not("foo"), "-foo");
  test.equal(Logic.not("-foo"), "foo");
  test.equal(Logic.not("--foo"), "-foo");
  test.equal(Logic.not(1), -1);
  test.equal(Logic.not(-1), 1);
});

Tinytest.add("logic-solver - Logic.not formula", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.not(Logic.or("A", "B")));
    },
    ["-A", "-B"],
    function (s) {
      s.forbid(Logic.not(Logic.or("A", "B")));
    },
    ["A v B"],
    function (s) {
      s.require(Logic.or(Logic.not(Logic.or("A", "B")), "C"));
    },
    ["-A v $or1", "-B v $or1", "-$or1 v C"]
  ]);
});

Tinytest.add("logic-solver - Require/forbid after formula gen", function (test) {
  runClauseTests(test, [
    function (s) {
      // Use a formula in the positive and then require it.  Requiring
      // the formula does not regenerate its clauses, it just requires
      // the formula's variable ($or1).
      var f = Logic.or("A", "B");
      s.require(Logic.or(f, "C"));
      s.require(f);
    },
    ["A v B v -$or1","$or1 v C","$or1"]
  ]);

  runClauseTests(test, [
    function (s) {
      // Use a formula in the posiive and then forbid it.
      // Forbidding a formula that has not been used in the
      // negative before requires generating new clauses.
      var f = Logic.or("A", "B");
      s.require(Logic.or(f, "C"));
      s.forbid(f);
    },
    ["A v B v -$or1","$or1 v C","-A v $or1","-B v $or1","-$or1"]
  ]);

  runClauseTests(test, [
    function (s) {
      // Use a formula in the negative and then forbid it.
      var f = Logic.or("A", "B");
      s.require(Logic.or(Logic.not(f), "C"));
      s.forbid(f);
    },
    ["-A v $or1","-B v $or1","-$or1 v C","-$or1"]
  ]);

  runClauseTests(test, [
    function (s) {
      // Use a formula in the negative and then require it.
      var f = Logic.or("A", "B");
      s.require(Logic.or(Logic.not(f), "C"));
      s.require(f);
    },
    ["-A v $or1","-B v $or1","-$or1 v C","A v B v -$or1","$or1"]
  ]);
});


Tinytest.add("logic-solver - Logic.and", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.and('A', 'B'));
    },
    ["A", "B"],
    function (s) {
      s.require(Logic.and(['A', 'B']));
    },
    ["A", "B"],
    function (s) {
      s.require(Logic.and(['A'], ['-B'], 'C'));
    },
    ["A", "-B", "C"],
    function (s) {
      s.forbid(Logic.and('A', '-B', 'C'));
    },
    ["-A v B v -C"],
    function (s) {
      s.forbid(Logic.and());
    },
    [""],
    function (s) {
      s.require(Logic.and());
    },
    [],
    function (s) {
      s.require(Logic.or(Logic.and(Logic.or("A", "B"),
                                   Logic.or("-A", "C")),
                         "-D"));
    },
    ["A v B v -$or1",
     "$or1 v -$and1",
     "-A v C v -$or2",
     "$or2 v -$and1",
     "$and1 v -D"],
    function (s) {
      s.require(Logic.or(Logic.not(Logic.and(Logic.or("A", "B"),
                                             Logic.or("-A", "C"))),
                         "-D"));
    },
    ["-A v $or1",
     "-B v $or1",
     "A v $or2",
     "-C v $or2",
     "-$or1 v -$or2 v $and1",
     "-$and1 v -D"]
  ]);
});

Tinytest.add("logic-solver - Logic.xor", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.xor()); },
    [""],
    function (s) {
      s.forbid(Logic.xor()); },
    [],
    function (s) {
      s.require(Logic.or(Logic.xor(), Logic.xor())); },
    ["-$F", "$F v $F"],
    function (s) {
      s.require(Logic.xor("A")); },
    ["A"],
    function (s) {
      s.forbid(Logic.xor("A")); },
    ["-A"],
    function (s) {
      s.require(Logic.xor("A", "B")); },
    ["A v B", "-A v -B"],
    function (s) {
      s.forbid(Logic.xor("A", "B")); },
    ["A v -B", "-A v B"],
    function (s) {
      s.require(Logic.xor(["A", []], ["B"], [])); },
    ["A v B", "-A v -B"],
    function (s) {
      s.require(Logic.xor("A", "B", "C")); },
    ["A v B v C", "A v -B v -C", "-A v B v -C", "-A v -B v C"],
    function (s) {
      s.forbid(Logic.xor("A", "B", "C"));  },
    ["-A v -B v -C", "-A v B v C", "A v -B v C", "A v B v -C"],
    function (s) {
      s.require(Logic.xor("A", "B", "C", "D")); },
    ["A v B v C v -$xor1",
     "A v -B v -C v -$xor1",
     "-A v B v -C v -$xor1",
     "-A v -B v C v -$xor1",
     "$xor1 v D",
     "-A v -B v -C v $xor1",
     "-A v B v C v $xor1",
     "A v -B v C v $xor1",
     "A v B v -C v $xor1",
     "-$xor1 v -D"],
    function (s) {
      s.forbid(Logic.xor("A", "B", "C", "D")); },
    ["A v B v C v -$xor1",
     "A v -B v -C v -$xor1",
     "-A v B v -C v -$xor1",
     "-A v -B v C v -$xor1",
     "$xor1 v -D",
     "-A v -B v -C v $xor1",
     "-A v B v C v $xor1",
     "A v -B v C v $xor1",
     "A v B v -C v $xor1",
     "-$xor1 v D"],
    function (s) {
      s.require(Logic.xor("A", "B", "C", "D", "E")); },
    ["A v B v C v -$xor1",
     "A v -B v -C v -$xor1",
     "-A v B v -C v -$xor1",
     "-A v -B v C v -$xor1",
     "D v E v -$xor2",
     "-D v -E v -$xor2",
     "$xor1 v $xor2",
     "-A v -B v -C v $xor1",
     "-A v B v C v $xor1",
     "A v -B v C v $xor1",
     "A v B v -C v $xor1",
     "D v -E v $xor2",
     "-D v E v $xor2",
     "-$xor1 v -$xor2"],
    function (s) {
      s.forbid(Logic.xor("A", "B", "C", "D", "E")); },
    ["A v B v C v -$xor1",
     "A v -B v -C v -$xor1",
     "-A v B v -C v -$xor1",
     "-A v -B v C v -$xor1",
     "D v -E v $xor2",
     "-D v E v $xor2",
     "$xor1 v -$xor2",
     "-A v -B v -C v $xor1",
     "-A v B v C v $xor1",
     "A v -B v C v $xor1",
     "A v B v -C v $xor1",
     "D v E v -$xor2",
     "-D v -E v -$xor2",
     "-$xor1 v $xor2"]
  ]);
});

Tinytest.add("logic-solver - require/forbid generation", function (test) {
  runClauseTests(test, [
    function (s) {
      var f = Logic.and("A", "B");
      s.require(Logic.or(f, "C"));
      debugger;
      s.forbid(f);
    },
    ["A v -$and1", "B v -$and1", "$and1 v C", "-A v -B v $and1", "-$and1"],
    function (s) {
      var f = Logic.and("A", "B");
      s.require(Logic.or(Logic.not(f), "C"));
      s.require(f);
    },
    ["-A v -B v $and1", "-$and1 v C", "A v -$and1", "B v -$and1", "$and1"],
    function (s) {
      var f = Logic.and("A", "B");
      s.require(f);
      s.require(f);
    },
    ["A", "B"],
    function (s) {
      var f = Logic.and("A", "B");
      s.forbid(f);
      s.forbid(f);
    },
    ["-A v -B"],
    function (s) {
      var f = Logic.and("A", "B");
      s.require(f);
      s.forbid(f);
      s.forbid(f);
    },
    ["A", "B", ""],
    function (s) {
      var f = Logic.and("A", "B");
      s.forbid(f);
      s.require(f);
      s.require(f);
    },
    ["-A v -B", ""],
    function (s) {
      var f = Logic.and("A", "B");
      s.require(f);
      s.require(Logic.or(f, "C"));
    },
    ["$T", "A", "B", "$T v C"],
    function (s) {
      var f = Logic.and("A", "B");
      s.require(f);
      s.require(Logic.or(Logic.not(f), "C"));
    },
    ["$T", "A", "B", "-$T v C"],
    function (s) {
      var f = Logic.and("A", "B");
      s.forbid(f);
      s.require(Logic.or(Logic.not(f), "C"));
    },
    ["-$F", "-A v -B", "-$F v C"],
    function (s) {
      var f = Logic.and("A", "B");
      s.require(f);
      s.forbid(f);
      s.require(Logic.or(f, "C"));
    },
    ["$T", "A", "B", "", "$T v C"],
    function (s) {
      var f = Logic.and("A", "B");
      s.forbid(f);
      s.require(f);
      s.require(Logic.or(f, "C"));
    },
    ["$T", "-A v -B", "", "$T v C"]
  ]);
});
