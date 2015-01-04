
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

var formatLines = function (stringArray) {
  return JSON.stringify(stringArray).replace(/","/g, '",\n "');
};

var checkClauses = function (test, f, expected) {
  check(f, Function);
  check(expected, [String]);
  var s = new Logic.Solver;
  f(s);
  test.equal(formatLines(s._clauseStrings()),
             formatLines(expected));
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

  runClauseTests(test, [
    function (s) {
      var f = Logic.or("A", "B");
      s.require(Logic.and(f, "C"));
      s.require(f);
    },
    // Arguments to AND are generated in place, meaning that if `f`
    // is used elsewhere, its clauses will be generated twice.
    // Oh well.  It's a trade-off.  The same applies to OR when
    // generating the false case.
    ["A v B",
     "C",
     "A v B"]
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
    ["A v B v -$and1",
     "-A v C v -$and1",
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

Tinytest.add("logic-solver - Logic.atMostOne", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.atMostOne()); },
    [],
    function (s) {
      s.forbid(Logic.atMostOne()); },
    [""],
    function (s) {
      s.require(Logic.atMostOne("A")); },
    [],
    function (s) {
      s.forbid(Logic.atMostOne("A")); },
    [""],
    function (s) {
      s.require(Logic.atMostOne("A", "B")); },
    ["-A v -B"],
    function (s) {
      s.forbid(Logic.atMostOne("A", "B")); },
    ["A", "B"],
    function (s) {
      s.require(Logic.atMostOne("A", "B", "C")); },
    ["-A v -B", "-A v -C", "-B v -C"],
    function (s) {
      s.forbid(Logic.atMostOne("A", "B", "C")); },
    ["A v B", "A v C", "B v C"],
    function (s) {
      s.require(Logic.atMostOne("A", "B", "C", "D")); },
    // If D is true, then all of A,B,C must be false.
    // Two of A,B,C must be false.
    ["-A v $or1",
     "-B v $or1",
     "-C v $or1",
     "-$or1 v -D",
     "-A v -B",
     "-A v -C",
     "-B v -C"],
    function (s) {
      s.forbid(Logic.atMostOne("A", "B", "C", "D")); },
    // If any two of A,B,C are false (lines 3,4,5), then we'll need
    // one of A,B,C and D to be true (lines 1,2 by implication of
    // line 6).  (This isn't the reasoning that generated the clauses,
    // but it's one way to think of it.)
    ["A v B v C v $atMostOne1",
     "D v $atMostOne1",
     "A v B v $atMostOne2",
     "A v C v $atMostOne2",
     "B v C v $atMostOne2",
     "-$atMostOne1 v -$atMostOne2"],
    function (s) {
      s.require(Logic.atMostOne("A", "B", "C", "D", "E")); },
    ["-A v $or1",
     "-B v $or1",
     "-C v $or1",
     "-D v $or2",
     "-E v $or2",
     "-$or1 v -$or2",
     "-A v -B",
     "-A v -C",
     "-B v -C",
     "-D v -E"],
    function (s) {
      s.forbid(Logic.atMostOne("A", "B", "C", "D", "E")); },
    ["A v B v C v $atMostOne1",
     "D v E v $atMostOne1",
     "A v B v $atMostOne2",
     "A v C v $atMostOne2",
     "B v C v $atMostOne2",
     "D v $atMostOne3",
     "E v $atMostOne3",
     "-$atMostOne1 v -$atMostOne2 v -$atMostOne3"]
  ]);
});

Tinytest.add("logic-solver - Logic.implies, Logic.equiv", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.implies("A", "B")); },
    ["-A v B"],
    function (s) {
      s.forbid(Logic.implies("A", "B")); },
    ["A", "-B"],
    function (s) {
      s.require(Logic.or(Logic.implies("A", "B"), "C")); },
    ["-A v B v -$implies1", "$implies1 v C"],
    function (s) {
      s.require(Logic.or(Logic.implies(Logic.or("A", "D"), "B"), "C")); },
    ["-A v $or1",
     "-D v $or1",
     "-$or1 v B v -$implies1",
     "$implies1 v C"],
    function (s) {
      s.require(Logic.equiv("A", "B")); },
    ["A v -B",
     "-A v B"],
    function (s) {
      s.forbid(Logic.equiv("A", "B")); },
    ["A v B",
     "-A v -B"],
    function (s) {
      s.require(Logic.equiv(Logic.or("A", "B"),
                           Logic.or("C", "D"))); },
    ["A v B v -$or1",
     "-C v $or2",
     "-D v $or2",
     "$or1 v -$or2",
     "-A v $or1",
     "-B v $or1",
     "C v D v -$or2",
     "-$or1 v $or2"]
  ]);
});

Tinytest.add("logic-solver - Logic.exactlyOne", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.exactlyOne()); },
    [""],
    function (s) {
      s.forbid(Logic.exactlyOne()); },
    [],
    function (s) {
      s.require(Logic.exactlyOne("A")); },
    ["A"],
    function (s) {
      s.forbid(Logic.exactlyOne("A")); },
    ["-A"],
    function (s) {
      s.require(Logic.exactlyOne("A", "B")); },
    ["A v B", "-A v -B"],
    function (s) {
      s.forbid(Logic.exactlyOne("A", "B")); },
    ["A v -B", "-A v B"],
    function (s) {
      s.require(Logic.exactlyOne("A", "B", "C")); },
    ["-A v -B",
     "-A v -C",
     "-B v -C",
     "A v B v C"],
    function (s) {
      s.forbid(Logic.exactlyOne("A", "B", "C")); },
    ["A v B v $atMostOne1",
     "A v C v $atMostOne1",
     "B v C v $atMostOne1",
     "-A v $or1",
     "-B v $or1",
     "-C v $or1",
     "-$atMostOne1 v -$or1"]
  ]);
});

var equalBitFormulas = function (test, bits1, bits2) {
  test.isTrue(bits1 instanceof Logic.Bits);
  test.isTrue(bits2 instanceof Logic.Bits);
  // the elements of bits1 and bits2 will have to be
  // terms (or the same Formula objects) for this to
  // compare by value
  test.equal(bits1.bits, bits2.bits);
};

Tinytest.add("logic-solver - Logic.constantBits", function (test) {
  equalBitFormulas(test, Logic.constantBits(0), new Logic.Bits([]));
  equalBitFormulas(test, Logic.constantBits(1), new Logic.Bits(["$T"]));
  equalBitFormulas(test, Logic.constantBits(2), new Logic.Bits(["$F", "$T"]));
  equalBitFormulas(test, Logic.constantBits(3), new Logic.Bits(["$T", "$T"]));
  equalBitFormulas(test, Logic.constantBits(4), new Logic.Bits(["$F", "$F", "$T"]));
  equalBitFormulas(test, Logic.constantBits(5), new Logic.Bits(["$T", "$F", "$T"]));
});

Tinytest.add("logic-solver - Logic.equalBits", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits([]),
                                new Logic.Bits([]))); },
    [],
    function (s) {
      s.forbid(Logic.equalBits(new Logic.Bits([]),
                               new Logic.Bits([]))); },
    [""],
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits(["A"]),
                                new Logic.Bits([]))); },
    ["-A"],
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits([]),
                                new Logic.Bits(["A"]))); },
    ["-A"],
    function (s) {
      s.forbid(Logic.equalBits(new Logic.Bits(["A"]),
                               new Logic.Bits([]))); },
    ["A"],
    function (s) {
      s.forbid(Logic.equalBits(new Logic.Bits([]),
                               new Logic.Bits(["A"]))); },
    ["A"],
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits(["A", "B", "C"]),
                                new Logic.Bits([]))); },
    ["-A", "-B", "-C"],
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits([]),
                                new Logic.Bits(["A", "B", "C"]))); },
    ["-A", "-B", "-C"],
    function (s) {
      s.forbid(Logic.equalBits(new Logic.Bits(["A", "B", "C"]),
                               new Logic.Bits([]))); },
    ["A v B v C"],
    function (s) {
      s.forbid(Logic.equalBits(new Logic.Bits([]),
                               new Logic.Bits(["A", "B", "C"]))); },
    ["A v B v C"],
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits(["A"]),
                                new Logic.Bits(["B"]))); },
    ["A v -B", "-A v B"],
    function (s) {
      s.forbid(Logic.equalBits(new Logic.Bits(["A"]),
                               new Logic.Bits(["B"]))); },
    ["A v B", "-A v -B"],
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits(["A", "B"]),
                                new Logic.Bits(["X", "Y"]))); },
    ["A v -X", "-A v X",
     "B v -Y", "-B v Y"],
    function (s) {
      s.forbid(Logic.equalBits(new Logic.Bits(["A", "B"]),
                               new Logic.Bits(["X", "Y"]))); },
    ["A v X v $equiv1",
     "-A v -X v $equiv1",
     "B v Y v $equiv2",
     "-B v -Y v $equiv2",
     "-$equiv1 v -$equiv2"],
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits(["A", "B"]),
                                new Logic.Bits(["X"]))); },
    ["A v -X", "-A v X", "-B"],
    function (s) {
      s.forbid(Logic.equalBits(new Logic.Bits(["A", "B"]),
                               new Logic.Bits(["X"]))); },
    ["A v X v $equiv1",
     "-A v -X v $equiv1",
     "-$equiv1 v B"],
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits(["A"]),
                                new Logic.Bits(["X", "Y"]))); },
    ["A v -X", "-A v X", "-Y"],
    function (s) {
      s.forbid(Logic.equalBits(new Logic.Bits(["A"]),
                               new Logic.Bits(["X", "Y"]))); },
    ["A v X v $equiv1",
     "-A v -X v $equiv1",
     "-$equiv1 v Y"],
    function (s) {
      s.require(Logic.equalBits(new Logic.Bits([Logic.or("A", "B")]),
                                new Logic.Bits([Logic.or("C", "D")]))); },
    ["A v B v -$or1",
     "-C v $or2",
     "-D v $or2",
     "$or1 v -$or2",
     "-A v $or1",
     "-B v $or1",
     "C v D v -$or2",
     "-$or1 v $or2"]
  ]);
});

Tinytest.add("logic-solver - Logic.lessThan[OrEqual]", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(Logic.lessThan(new Logic.Bits([]),
                               new Logic.Bits([]))); },
    [""],
    function (s) {
      s.require(Logic.lessThanOrEqual(new Logic.Bits([]),
                                      new Logic.Bits([]))); },
    [],
    function (s) {
      s.forbid(Logic.lessThan(new Logic.Bits([]),
                              new Logic.Bits([]))); },
    [],
    function (s) {
      s.forbid(Logic.lessThanOrEqual(new Logic.Bits([]),
                                     new Logic.Bits([]))); },
    [""],
    function (s) {
      s.require(Logic.lessThan(new Logic.Bits(["A"]),
                               new Logic.Bits([]))); },
    [""],
    function (s) {
      s.require(Logic.lessThanOrEqual(new Logic.Bits(["A"]),
                                      new Logic.Bits([]))); },
    ["-A"],
    function (s) {
      s.forbid(Logic.lessThan(new Logic.Bits(["A"]),
                              new Logic.Bits([]))); },
    [],
    function (s) {
      s.forbid(Logic.lessThanOrEqual(new Logic.Bits(["A"]),
                                     new Logic.Bits([]))); },
    ["A"],
    function (s) {
      s.require(Logic.lessThan(new Logic.Bits([]),
                               new Logic.Bits(["A"]))); },
    ["A"],
    function (s) {
      s.require(Logic.lessThanOrEqual(new Logic.Bits([]),
                                      new Logic.Bits(["A"]))); },
    [],
    function (s) {
      s.forbid(Logic.lessThan(new Logic.Bits([]),
                              new Logic.Bits(["A"]))); },
    ["-A"],
    function (s) {
      s.forbid(Logic.lessThanOrEqual(new Logic.Bits([]),
                                     new Logic.Bits(["A"]))); },
    [""],
    function (s) {
      s.require(Logic.lessThan(new Logic.Bits(["A"]),
                               new Logic.Bits(["B"]))); },
    ["-A v B",
     "A v B",
     "-A v -B"],
    function (s) {
      s.require(Logic.lessThanOrEqual(new Logic.Bits(["A"]),
                                      new Logic.Bits(["B"]))); },
    ["-A v B"],
    function (s) {
      s.forbid(Logic.lessThan(new Logic.Bits(["A"]),
                              new Logic.Bits(["B"]))); },
    ["-B v A"],
    function (s) {
      s.forbid(Logic.lessThanOrEqual(new Logic.Bits(["A"]),
                                     new Logic.Bits(["B"]))); },
    ["-B v A",
     "B v A",
     "-B v -A"],
    function (s) {
      s.require(Logic.lessThan(new Logic.Bits(["B", "A"]),
                               new Logic.Bits(["Y", "X"]))); },
    ["-A v X",
     "A v X v -$xor1",
     "-A v -X v -$xor1",
     "$xor1 v -B v Y",
     "B v Y v -$xor2",
     "-B v -Y v -$xor2",
     "$xor2 v $xor1"],
    function (s) {
      s.require(Logic.lessThanOrEqual(new Logic.Bits(["B", "A"]),
                                      new Logic.Bits(["Y", "X"]))); },
    ["-A v X",
     "A v X v -$xor1",
     "-A v -X v -$xor1",
     "$xor1 v -B v Y"],
    function (s) {
      s.forbid(Logic.lessThan(new Logic.Bits(["B", "A"]),
                              new Logic.Bits(["Y", "X"]))); },
    ["-X v A",
     "X v A v -$xor1",
     "-X v -A v -$xor1",
     "$xor1 v -Y v B"],
    function (s) {
      s.forbid(Logic.lessThanOrEqual(new Logic.Bits(["B", "A"]),
                                     new Logic.Bits(["Y", "X"]))); },
    ["-X v A",
     "X v A v -$xor1",
     "-X v -A v -$xor1",
     "$xor1 v -Y v B",
     "Y v B v -$xor2",
     "-Y v -B v -$xor2",
     "$xor2 v $xor1"],
    function (s) {
      s.require(Logic.lessThan(new Logic.Bits(["A"]),
                               new Logic.Bits(["Y", "X"]))); },
    ["X v -A v Y",
     "A v Y v -$xor1",
     "-A v -Y v -$xor1",
     "$xor1 v X"],
    function (s) {
      s.require(Logic.lessThanOrEqual(new Logic.Bits(["A"]),
                                      new Logic.Bits(["Y", "X"]))); },
    ["X v -A v Y"],
    function (s) {
      s.forbid(Logic.lessThan(new Logic.Bits(["A"]),
                              new Logic.Bits(["Y", "X"]))); },
    ["-X",
     "-Y v A"],
    function (s) {
      s.forbid(Logic.lessThanOrEqual(new Logic.Bits(["A"]),
                                     new Logic.Bits(["Y", "X"]))); },
    ["-X",
     "-Y v A",
     "Y v A",
     "-Y v -A"],
    function (s) {
      s.require(Logic.lessThan(new Logic.Bits(["B", "A"]),
                               new Logic.Bits(["X"]))); },
    ["-A",
     "-B v X",
     "B v X",
     "-B v -X"],
    function (s) {
      s.require(Logic.lessThanOrEqual(new Logic.Bits(["B", "A"]),
                                      new Logic.Bits(["X"]))); },
    ["-A",
     "-B v X"],
    function (s) {
      s.forbid(Logic.lessThan(new Logic.Bits(["B", "A"]),
                              new Logic.Bits(["X"]))); },
    ["A v -X v B"],
    function (s) {
      s.forbid(Logic.lessThanOrEqual(new Logic.Bits(["B", "A"]),
                                     new Logic.Bits(["X"]))); },
    ["A v -X v B",
     "X v B v -$xor1",
     "-X v -B v -$xor1",
     "$xor1 v A"],
    function (s) {
      s.require(Logic.lessThan(new Logic.Bits(["C", "B", "A"]),
                               new Logic.Bits(["Z", "Y", "X"]))); },
    ["-A v X",
     "A v X v -$xor1",
     "-A v -X v -$xor1",
     "$xor1 v -B v Y",
     "B v Y v -$xor2",
     "-B v -Y v -$xor2",
     "$xor2 v $xor1 v -C v Z",
     "C v Z v -$xor3",
     "-C v -Z v -$xor3",
     "$xor3 v $xor2 v $xor1"],
    function (s) {
      s.require(Logic.lessThanOrEqual(new Logic.Bits(["C", "B", "A"]),
                                      new Logic.Bits(["Z", "Y", "X"]))); },
    ["-A v X",
     "A v X v -$xor1",
     "-A v -X v -$xor1",
     "$xor1 v -B v Y",
     "B v Y v -$xor2",
     "-B v -Y v -$xor2",
     "$xor2 v $xor1 v -C v Z"],
    function (s) {
      s.forbid(Logic.lessThan(new Logic.Bits(["C", "B", "A"]),
                              new Logic.Bits(["Z", "Y", "X"]))); },
    ["-X v A",
     "X v A v -$xor1",
     "-X v -A v -$xor1",
     "$xor1 v -Y v B",
     "Y v B v -$xor2",
     "-Y v -B v -$xor2",
     "$xor2 v $xor1 v -Z v C"],
    function (s) {
      s.forbid(Logic.lessThanOrEqual(new Logic.Bits(["C", "B", "A"]),
                                     new Logic.Bits(["Z", "Y", "X"]))); },
    ["-X v A",
     "X v A v -$xor1",
     "-X v -A v -$xor1",
     "$xor1 v -Y v B",
     "Y v B v -$xor2",
     "-Y v -B v -$xor2",
     "$xor2 v $xor1 v -Z v C",
     "Z v C v -$xor3",
     "-Z v -C v -$xor3",
     "$xor3 v $xor2 v $xor1"]
  ]);
});

Tinytest.add("logic-solver - half/full sum/carry", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(new Logic.HalfAdderSum("A", "B")); },
    ["A v B", "-A v -B"],
    function (s) {
      s.forbid(new Logic.HalfAdderSum("A", "B")); },
    ["A v -B", "-A v B"],
    function (s) {
      s.require(Logic.or(new Logic.HalfAdderSum("A", "B"), "C")); },
    ["A v B v -$hsum1",
     "-A v -B v -$hsum1",
     "$hsum1 v C"],
    function (s) {
      s.require(new Logic.HalfAdderCarry("A", "B")); },
    ["A", "B"],
    function (s) {
      s.forbid(new Logic.HalfAdderCarry("A", "B")); },
    ["-A v -B"],
    function (s) {
      s.require(Logic.or(new Logic.HalfAdderCarry("A", "B"), "C")); },
    ["A v -$hcarry1",
     "B v -$hcarry1",
     "$hcarry1 v C"]
  ]);

  runClauseTests(test, [
    function (s) {
      s.require(new Logic.FullAdderSum("A", "B", "C")); },
    ["A v B v C",
     "A v -B v -C",
     "-A v B v -C",
     "-A v -B v C"],
    function (s) {
      s.forbid(new Logic.FullAdderSum("A", "B", "C")); },
    ["-A v -B v -C",
     "-A v B v C",
     "A v -B v C",
     "A v B v -C"],
    function (s) {
      s.require(Logic.or(new Logic.FullAdderSum("A", "B", "C"), "D")); },
    ["A v B v C v -$fsum1",
     "A v -B v -C v -$fsum1",
     "-A v B v -C v -$fsum1",
     "-A v -B v C v -$fsum1",
     "$fsum1 v D"],
    function (s) {
      s.require(new Logic.FullAdderCarry("A", "B", "C")); },
    ["A v B",
     "A v C",
     "B v C"],
    function (s) {
      s.forbid(new Logic.FullAdderCarry("A", "B", "C")); },
    ["-A v -B",
     "-A v -C",
     "-B v -C"],
    function (s) {
      s.require(Logic.or(new Logic.FullAdderCarry("A", "B", "C"), "D")); },
    ["A v B v -$fcarry1",
     "A v C v -$fcarry1",
     "B v C v -$fcarry1",
     "$fcarry1 v D"]
  ]);
});

Tinytest.add("logic-solver - sum of terms", function (test) {
  runClauseTests(test, [
    function (s) {
      s.require(
        // XY = A + B + C
        Logic.equalBits(new Logic.Bits(["Y", "X"]),
                        Logic.sum("A", "B", "C")));
    },
    ["-A v -B v -C v $fsum1",
     "-A v B v C v $fsum1",
     "A v -B v C v $fsum1",
     "A v B v -C v $fsum1",
     "Y v -$fsum1",
     "A v B v C v -$fsum1",
     "A v -B v -C v -$fsum1",
     "-A v B v -C v -$fsum1",
     "-A v -B v C v -$fsum1",
     "-Y v $fsum1",
     "-A v -B v $fcarry1",
     "-A v -C v $fcarry1",
     "-B v -C v $fcarry1",
     "X v -$fcarry1",
     "A v B v -$fcarry1",
     "A v C v -$fcarry1",
     "B v C v -$fcarry1",
     "-X v $fcarry1"],
    function (s) {
      s.require(
        // AB + C = XYZ
        Logic.equalBits(new Logic.Bits(["Z", "Y", "X"]),
                        Logic.sum(new Logic.Bits(["B", "A"]), "C")));
    },
    ["B v -C v $hsum1",
     "-B v C v $hsum1",
     "Z v -$hsum1",
     "B v C v -$hsum1",
     "-B v -C v -$hsum1",
     "-Z v $hsum1",
     "-B v -C v $hcarry2",
     "A v -$hcarry2 v $hsum2",
     "B v -$hcarry2",
     "C v -$hcarry2",
     "-A v $hcarry2 v $hsum2",
     "Y v -$hsum2",
     "A v $hcarry2 v -$hsum2",
     "-A v -$hcarry2 v -$hsum2",
     "-Y v $hsum2",
     "-A v -$hcarry2 v $hcarry1",
     "X v -$hcarry1",
     "A v -$hcarry1",
     "B v -$hcarry1",
     "C v -$hcarry1",
     "-X v $hcarry1"],
    function (s) {
      s.require(
        // 8X + 15Y = ZABCDE
        Logic.equalBits(new Logic.Bits(["E", "D", "C", "B", "A", "Z"]),
                        Logic.weightedSum(["X", "Y"], [8, 15])));
    },
    // C, D, and E all = Y
    // AB = X + Y
    // Z = 0
    ["E v -Y",
     "-E v Y",
     "D v -Y",
     "-D v Y",
     "C v -Y",
     "-C v Y",
     "X v -Y v $hsum1",
     "-X v Y v $hsum1",
     "B v -$hsum1",
     "X v Y v -$hsum1",
     "-X v -Y v -$hsum1",
     "-B v $hsum1",
     "-X v -Y v $hcarry1",
     "A v -$hcarry1",
     "X v -$hcarry1",
     "Y v -$hcarry1",
     "-A v $hcarry1",
     "-Z"],
    function (s) {
      // A + B < 2
      s.require(Logic.lessThan(Logic.sum("A", "B"), Logic.constantBits(2)));
    },
    ["-$F",
     "$T",
     "-A v -B v $hcarry1",
     "-$hcarry1 v $T",
     "A v -$hcarry1",
     "B v -$hcarry1",
     "$hcarry1 v $T v -$xor1",
     "-$hcarry1 v -$T v -$xor1",
     "A v -B v $hsum1",
     "-A v B v $hsum1",
     "$xor1 v -$hsum1 v $F",
     "A v B v -$hsum1",
     "-A v -B v -$hsum1",
     "$hsum1 v $F v -$xor2",
     "-$hsum1 v -$F v -$xor2",
     "$xor2 v $xor1"]
  ]);
});

Tinytest.add("logic-solver - MiniSat", function (test) {
  var M = new Logic._MiniSat;
  // Unique solution is (1,2,3,4) = (0,1,0,0)
  test.isTrue(M.addClause([-4]));
  test.isTrue(M.addClause([-1, -2]));
  test.isTrue(M.addClause([4, -1, 2]));
  test.isTrue(M.addClause([1, 2, 3]));
  test.isTrue(M.addClause([1, 2, -3, 4]));
  test.isTrue(M.addClause([1, -2, -3]));
  test.isTrue(M.solve());
  test.equal(M.getSolution(), [null, false, true, false, false]);
  M.addClause([1, -2, 3, 4]);
  test.isFalse(M.solve());
  test.isFalse(M.addClause([4]));
});
