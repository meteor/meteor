
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

Tinytest.add("logic-solver - illegal NameTerms", function (test) {
  var s = new Logic.Solver;

  test.throws(function () {
    s.require('');
  });

  test.throws(function () {
    s.require('-');
  });

  test.throws(function () {
    s.require('0');
  });

  test.throws(function () {
    s.require('$x');
  });

  test.throws(function () {
    s.require('-1');
  });

  test.throws(function () {
    s.require('---123');
  });
});

Tinytest.add("logic-solver - toNameTerm, toNumTerm", function (test) {
  var s = new Logic.Solver;

  test.equal(s.toNumTerm("foo"), 3);
  test.equal(s.toNumTerm("-foo"), -3);

  test.equal(s.toNameTerm(3), "foo");
  test.equal(s.toNameTerm(-3), "-foo");

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
    ["-$or1 v -$or2 v $and1",
     "A v $or2",
     "-C v $or2",
     "-A v $or1",
     "-B v $or1",
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
    ["-$or1 v B v -$implies1",
     "-A v $or1",
     "-D v $or1",
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
     "A v -$hcarry2 v $hsum2",
     "-A v $hcarry2 v $hsum2",
     "B v -$hcarry2",
     "C v -$hcarry2",
     "-B v -C v $hcarry2",
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
     "$hcarry1 v $T v -$xor1",
     "-$hcarry1 v -$T v -$xor1",
     "A v -$hcarry1",
     "B v -$hcarry1",
     "A v -B v $hsum1",
     "-A v B v $hsum1",
     "$xor1 v -$hsum1 v $F",
     "$hsum1 v $F v -$xor2",
     "-$hsum1 v -$F v -$xor2",
     "A v B v -$hsum1",
     "-A v -B v -$hsum1",
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

Tinytest.add("logic-solver - MiniSat solveAssuming", function (test) {
  var M = new Logic._MiniSat;
  M.ensureVar(1);
  test.isTrue(M.solveAssuming(1));
  test.equal(M.getSolution(), [null, true]);
  test.isTrue(M.solveAssuming(1));
  test.equal(M.getSolution(), [null, true]);
  test.isTrue(M.addClause([-1]));
  test.isTrue(M.addClause([2, -2]));
  test.isTrue(M.solve());
  test.equal(M.getSolution(), [null, false, false]); // empirically
  test.isTrue(M.solveAssuming(2));
  test.equal(M.getSolution(), [null, false, true]);
  test.isTrue(M.solve());
});


Tinytest.add("logic-solver - simple solve", function (test) {
  var s = new Logic.Solver;
  // Unique solution is (A,B,C,D) = (0,1,0,0)
  s.require("-D");
  s.require(Logic.or("-A", "-B"));
  s.require(Logic.or("D", "-A", "B"));
  s.require(Logic.or("A", "B", "C"));
  s.require(Logic.or("A", "B", "-C", "D"));
  s.require(Logic.or("A", "-B", "-C"));
  var sol = s.solve();
  test.equal(s._minisat._clauses.length, 8); // includes "$T" and "-$F"
  test.isTrue(sol);
  test.equal(sol.getMap(), {
    A: false, B: true, C: false, D: false
  });
  s.require(Logic.or("A", "-B", "C", "D"));
  var sol2 = s.solve();
  test.isFalse(sol2);
  // make sure we only added the new clause
  test.equal(s._minisat._clauses.length, 9);
});

Tinytest.add("logic-solver - assumptions", function (test) {
  var s = new Logic.Solver;
  s.getVarNum("A");
  s.getVarNum("B");
  s.getVarNum("C");
  s.getVarNum("D");
  // MiniSat could return any assignment of the variables here,
  // but we happen to know that it uses all-false as a starting
  // point for search.
  test.equal(s.solve().getMap(), { A: false, B: false, C: false, D: false });

  var atLeastOne = Logic.or("A", "B", "C", "D");
  // which of A,B,C,D comes back true is totally arbitrary, but it's
  // deterministic as long as we don't touch anything.
  test.equal(s.solveAssuming(atLeastOne).getMap(),
             { A: false, B: true, C: false, D: false });
  test.equal(formatLines(s._clauseStrings()),
             formatLines(["$or1 v -$assump1",
                          "A v B v C v D v -$or1"]));

  // assume the same thing again
  test.equal(s.solveAssuming(atLeastOne).getMap(),
             { A: false, B: true, C: false, D: false });
  test.equal(formatLines(s._clauseStrings()),
             formatLines(["$or1 v -$assump1",
                          "A v B v C v D v -$or1",
                          "$or1 v -$assump2"]));

  var none = Logic.and("-A", "-B", "-C", "-D");
  test.equal(s.solveAssuming(none).getMap(),
             { A: false, B: false, C: false, D: false });
  test.equal(formatLines(s._clauseStrings()),
             formatLines(["$or1 v -$assump1",
                          "A v B v C v D v -$or1",
                          "$or1 v -$assump2",
                          "$and1 v -$assump3",
                          "-A v -$and1",
                          "-B v -$and1",
                          "-C v -$and1",
                          "-D v -$and1"]));

  // require a formula that was previously just temporarily assumed!
  s.require(atLeastOne);
  test.equal(s.solve().getMap(),
             // any one could be true
             { A: false, B: true, C: false, D: false });
  test.equal(formatLines(s._clauseStrings()),
             formatLines(["$or1 v -$assump1",
                          "A v B v C v D v -$or1",
                          "$or1 v -$assump2",
                          "$and1 v -$assump3",
                          "-A v -$and1",
                          "-B v -$and1",
                          "-C v -$and1",
                          "-D v -$and1",
                          "$or1"]));

  test.equal(s.solveAssuming("D").getMap(),
             // at least D is true; other than that, anything goes
             { A: false, B: true, C: false, D: true });
  test.equal(formatLines(s._clauseStrings()),
             formatLines(["$or1 v -$assump1",
                          "A v B v C v D v -$or1",
                          "$or1 v -$assump2",
                          "$and1 v -$assump3",
                          "-A v -$and1",
                          "-B v -$and1",
                          "-C v -$and1",
                          "-D v -$and1",
                          "$or1",
                          "D v -$assump4"]));

  var sum = Logic.sum("A", "B", "C", "D");
  var atLeast2 = Logic.greaterThanOrEqual(sum, Logic.constantBits(2));
  test.equal(s.solveAssuming(atLeast2).getMap(),
             // any two or more, including D
             { A: false, B: true, C: false, D: true });
  s.require(atLeast2);
  var atLeast3 = Logic.greaterThanOrEqual(sum, Logic.constantBits(3));
  test.equal(s.solveAssuming(atLeast3).getMap(),
             // any three or more, including D
             { A: true, B: true, C: false, D: true });
  s.require(atLeast3);
  var atLeast4 = Logic.greaterThanOrEqual(sum, Logic.constantBits(4));
  test.equal(s.solveAssuming(atLeast4).getMap(),
             { A: true, B: true, C: true, D: true });

  s.forbid("C");
  test.equal(s.solve().getMap(),
             { A: true, B: true, C: false, D: true });
});

Tinytest.add("logic-solver - eight queens", function (test) {
  var boardSquare = function (r, c) {
    return String(r) + String(c);
  };

  Logic._disablingTypeChecks(function () {

    var solver = new Logic.Solver;
    var nums = _.range(1, 9); // 1..8
    _.each(nums, function (x) {
      // one per row x, one per column x
      solver.require(Logic.exactlyOne(_.map(nums, function (y) {
        return boardSquare(x, y);
      })));
      solver.require(Logic.exactlyOne(_.map(nums, function (y) {
        return boardSquare(y, x);
      })));
    });

    // At most one queen per diagonal.  A diagonal
    // consists of squares whose row + column sums
    // to a constant, or the horizontal flip of
    // such a set of squares.
    for (var flip = 0; flip <= 1; flip++) {
      for (var sum = 2; sum <= 16; sum++) {
        var vars = [];
        for (var r = 1; r <= sum-1; r++) {
          var c = sum - r;
          if (flip)
            c = 9-c;
          if (r >= 1 && r <= 8 && c >= 1 && c <= 8) {
            vars.push(boardSquare(r,c));
          }
        }
        solver.require(Logic.atMostOne(vars));
      }
    }

    var solution = solver.solve().getTrueVars();

    // solution might be, for example,
    // ["16", "24", "31", "45", "58", "62", "77", "83"]
    test.equal(solution.length, 8);
    test.isTrue(/^([1-8][1-8],){7}[1-8][1-8]$/.test(solution.join(',')));
    var assertEightDifferent = function (transformFunc) {
      test.equal(_.uniq(_.map(solution, transformFunc)).length, 8);
    };
    // queens occur in eight different rows, eight different columns
    assertEightDifferent(function (queen) { return queen.charAt(0); });
    assertEightDifferent(function (queen) { return queen.charAt(1); });
    // queens' row/col have eight different sums, eight different differences
    assertEightDifferent(function (queen) {
      return Number(queen.charAt(0)) - Number(queen.charAt(1));
    });
    assertEightDifferent(function (queen) {
      return Number(queen.charAt(0)) + Number(queen.charAt(1));
    });
  });
});


Tinytest.add("logic-solver - Sudoku", function (test) {
  var v = function (row, col, value) {
    return row + "," + col + "=" + value;
  };

  Logic._disablingTypeChecks(function () {
    //console.profile('sudoku');

    var solver = new Logic.Solver();

    // All rows, columns, and digits are 0-based internally.
    for (var x = 0; x < 9; x++) {
      // Find the top-left of box x. For example, Box 0 has a top-left
      // of (0,0).  Box 3 has a top-left of (3,0).
      var boxRow = Math.floor(x/3)*3;
      var boxCol = (x%3)*3;
      for (var y = 0; y < 9; y++) {
        var numberInEachSquare = [];
        var columnHavingYInRowX = [];
        var rowHavingYInColumnX = [];
        var squareHavingYInBoxX = [];
        for (var z = 0; z < 9; z++) {
          numberInEachSquare.push(v(x,y,z));
          columnHavingYInRowX.push(v(x,z,y));
          rowHavingYInColumnX.push(v(z,x,y));
          squareHavingYInBoxX.push(v(
            boxRow + Math.floor(z/3),
            boxCol + (z%3),
            y));
        }
        solver.require(Logic.exactlyOne(numberInEachSquare));
        solver.require(Logic.exactlyOne(columnHavingYInRowX));
        solver.require(Logic.exactlyOne(rowHavingYInColumnX));
        solver.require(Logic.exactlyOne(squareHavingYInBoxX));
      }
    }

    // Input a pretty hard Sudoku from here:
    // http://www.menneske.no/sudoku/eng/showpuzzle.html?number=6903541
    var puzzle = [
      "....839..",
      "1......3.",
      "..4....7.",
      ".42.3....",
      "6.......4",
      "....7..1.",
      ".2.......",
      ".8...92..",
      "...25...6"
    ];
    for (var r = 0; r < 9; r++) {
      var str = puzzle[r];
      for (var c = 0; c < 9; c++) {
        // zero-based digit
        var digit = str.charCodeAt(c) - 49;
        if (digit >= 0 && digit < 9) {
          solver.require(v(r, c, digit));
        }
      }
    }

    var solution = solver.solve().getTrueVars();
    var solutionString = _.map(solution, function (v) {
      return String(Number(v.slice(-1)) + 1);
    }).join('').match(/.{9}/g).join('\n');
    test.equal(solutionString, [
      "765483921",
      "198726435",
      "234915678",
      "842531769",
      "617892354",
      "359674812",
      "926147583",
      "581369247",
      "473258196"
    ].join('\n'));

    //console.profileEnd('sudoku');
  });
});

Tinytest.add("logic-solver - goes to eleven", function (test) {
  var solver = new Logic.Solver();
  var eleven = Logic.constantBits(11);
  var x = Logic.variableBits("x", 5);
  solver.require(Logic.lessThanOrEqual(x, eleven));
  solver.require(Logic.lessThanOrEqual(eleven, x));
  test.equal(solver.solve().getTrueVars().join(','), "x0,x1,x3");
});

Tinytest.add("logic-solver - evaluate", function (test) {
  var isTrue = function (x) {
    test.isTrue(x === true); // require exact "true"
  };
  var isFalse = function (x) {
    test.isFalse(x !== false); // require exact "false"
  };

  var s = new Logic.Solver();
  s.require("A", "-B");
  var f = Logic.and("A", "-B");
  s.require(f);
  var g = Logic.and("A", "B");
  s.forbid(g);
  var h1 = Logic.xor("A", "B");
  var h2 = Logic.and("A", "B");
  s.require(Logic.or("$T", h1));
  s.require(Logic.or("$T", h2));
  var sol = s.solve();
  isTrue(sol.evaluate("A"));
  isFalse(sol.evaluate("-A"));
  isTrue(sol.evaluate("--A"));
  isFalse(sol.evaluate("B"));
  isTrue(sol.evaluate("-B"));
  isTrue(sol.evaluate(f));
  isFalse(sol.evaluate(g));
  isTrue(sol.evaluate(h1));
  isFalse(sol.evaluate(h2));
  isFalse(sol.evaluate(Logic.not(h1)));
  isTrue(sol.evaluate(Logic.not(h2)));
  isTrue(sol.evaluate(Logic.exactlyOne("A", "B")));
  isFalse(sol.evaluate(Logic.exactlyOne("-A", "B")));

  s.require(Logic.or("$T", Logic.not(h1)));
  s.require(Logic.or("$T", Logic.not(h2)));
  isTrue(sol.evaluate(h1));
  isFalse(sol.evaluate(h2));

  test.throws(function () {
    sol.evaluate("C");
  });

  s.require("D");
  test.throws(function () {
    sol.evaluate("D");
  });
  test.throws(function () {
    sol.evaluate(Logic.or("D", "$T"));
  });

  test.equal(sol.evaluate(
    new Logic.Bits(["A", "B", "-A", "$F", "-B"])), 17);

  var numClauses = s.clauses.length;
  test.equal(sol.evaluate(Logic.weightedSum([Logic.or("A", "B"),
                                             "A", "A", "-B"],
                                            [7, 7, 7, 7])), 28);
  test.equal(s.clauses.length, numClauses);
});

Tinytest.add("logic-solver - toy packages", function (test) {

  var withSolver = function (func) {

    var solver = new Logic.Solver();

    _.each(allPackageVersions, function (versions, package) {
      versions = _.map(versions, function (v) {
        return package + "@" + v;
      });
      // e.g. atMostOne(["foo@1.0.0", "foo@1.0.1", "foo@2.0.0"])
      solver.require(Logic.atMostOne(versions));
      // e.g. equiv("foo", or(["foo@1.0.0", ...]))
      solver.require(Logic.equiv(package, Logic.or(versions)));
    });

    _.each(dependencies, function (depMap, packageVersion) {
      _.each(depMap, function (compatibleVersions, package2) {
        // e.g. implies("bar@1.2.4", "foo")
        solver.require(Logic.implies(packageVersion, package2));
        // Now ban all incompatible versions of package2 if
        // we select this packageVersion.
        // NOTE: This is not the best way to express constraints.  It's
        // not what we do in the real package constraint solver.
        _.each(allPackageVersions[package2], function (v) {
          if (! _.contains(compatibleVersions, v)) {
            solver.require(Logic.implies(packageVersion,
                                         Logic.not(package2 + "@" + v)));
          }
        });
      });
    });

    var optimize = function (solver, costVectorMap) {
      var solution = solver.solve();
      if (! solution) {
        return null;
      }

      var terms = [];
      var weightVectors = [];
      var vectorLength = null;
      _.each(costVectorMap, function (vector, key) {
        terms.push(key);
        weightVectors.push(vector);
        if (vectorLength === null) {
          vectorLength = vector.length;
        } else {
          if (vectorLength !== vector.length) {
            throw new Error("Uneven vector lengths: " + vectorLength +
                            " and " + vector.length);
          }
        }
      });

      for (var i = 0; i < vectorLength; i++) {
        var weights = _.pluck(weightVectors, i);
        solution = solver.minimize(solution, terms, weights);
      }

      return solution;
    };

    var solve = function (optionalCosts) {
      var solution = (optionalCosts ? optimize(solver, optionalCosts) :
                      solver.solve());
      if (! solution) {
        return solution; // null
      } else {
        // only return variables like "foo@1.0.0", not "foo"
        return _.filter(solution.getTrueVars(), function (v) {
          return v.indexOf('@') >= 0;
        });
      }
    };

    func(solver, solve);
  };

  var allPackageVersions = {
    'foo': ['1.0.0', '1.0.1', '2.0.0'],
    'bar': ['1.2.3', '1.2.4', '1.2.5'],
    'baz': ['3.0.0']
  };

  // Exact dependencies.
  var dependencies = {
    'bar@1.2.3': { foo: ['1.0.0'] },
    'bar@1.2.4': { foo: ['1.0.1'] },
    'bar@1.2.5': { foo: ['2.0.0'] },
    'baz@3.0.0': { foo: ['1.0.0', '1.0.1'],
                   bar: ['1.2.4', '1.2.5'] }
  };

  withSolver(function (solver, solve) {
    // Ask for "bar@1.2.5", get both it and "foo@2.0.0"
    solver.require("bar@1.2.5");
    test.equal(solve(), ["bar@1.2.5", "foo@2.0.0"]);
  });

  withSolver(function (solver, solve) {
    // Ask for "foo@1.0.1" and *some* version of bar!
    solver.require("foo@1.0.1");
    solver.require("bar");
    test.equal(solve(), ["bar@1.2.4", "foo@1.0.1"]);
  });

  withSolver(function (solver, solve) {
    // Ask for versions that can't be combined
    solver.require("foo@1.0.1");
    solver.require("bar@1.2.3");
    test.equal(solve(), null);
  });

  withSolver(function (solver, solve) {
    // Ask for baz, automatically get versions of foo and bar
    // such that foo satisfies bar's dependency!
    solver.require("baz");
    test.equal(solve(), ["bar@1.2.4",
                         "baz@3.0.0",
                         "foo@1.0.1"]);
  });

  withSolver(function (solver, solve) {
    // pick earliest versions
    solver.require("foo");
    solver.require("bar");
    test.equal(solve({ "foo@1.0.0": [0],
                       "foo@1.0.1": [1],
                       "foo@2.0.0": [2],
                       "bar@1.2.3": [0],
                       "bar@1.2.4": [1],
                       "bar@1.2.5": [2] }),
               ["bar@1.2.3", "foo@1.0.0"]);
  });

  withSolver(function (solver, solve) {
    // pick latest versions
    solver.require("foo");
    solver.require("bar");
    test.equal(solve({ "foo@1.0.0": [2],
                       "foo@1.0.1": [1],
                       "foo@2.0.0": [0],
                       "bar@1.2.3": [2],
                       "bar@1.2.4": [1],
                       "bar@1.2.5": [0] }),
               ["bar@1.2.5", "foo@2.0.0"]);
  });

  withSolver(function (solver, solve) {
    // pick earliest versions (but give solver a
    // cost vector with extra stuff)
    solver.require("foo");
    solver.require("bar");
    test.equal(solve({ "foo@1.0.0": [1, 0],
                       "foo@1.0.1": [1, 1],
                       "foo@2.0.0": [1, 2],
                       "bar@1.2.3": [2, 0],
                       "bar@1.2.4": [2, 1],
                       "bar@1.2.5": [2, 2] }),
               ["bar@1.2.3", "foo@1.0.0"]);
  });

  withSolver(function (solver, solve) {
    // pick latest versions (but give solver a
    // bigger vector to work with)
    solver.require("foo");
    solver.require("bar");
    test.equal(solve({ "foo@1.0.0": [1, 2],
                       "foo@1.0.1": [1, 1],
                       "foo@2.0.0": [1, 0],
                       "bar@1.2.3": [2, 2],
                       "bar@1.2.4": [2, 1],
                       "bar@1.2.5": [2, 0] }),
               ["bar@1.2.5", "foo@2.0.0"]);
  });

});

Tinytest.add("logic-solver - minimize", function (test) {
  var s = new Logic.Solver();
  s.require(Logic.or("A", "B", "C", "D"));
  // cost is equal to the number of false variables
  var costTerms = ["-A", "-B", "-C", "-D"];
  var costWeights = 1;
  var solution1 = s.solve();
  // nothing forces the cost (= the number of false variables)
  // to be greater than 0, but MiniSat will always discover
  // a sparser solution than (1,1,1,1) first.
  test.isTrue(solution1.getWeightedSum(costTerms, costWeights) > 0);
  var solution2 = s.minimize(solution1, costTerms, costWeights);
  test.isFalse(solution1 === solution2);
  test.equal(solution2.getWeightedSum(costTerms, costWeights), 0);
  test.equal(solution2.getTrueVars(), ["A", "B", "C", "D"]);
});

Tinytest.add("logic-solver - maximize", function (test) {
  var s = new Logic.Solver();
  // Find subset of {2, 5, 10, 11, 15} that sums to as close
  // as possible to 19 without going over.
  var costWeights = [2, 5, 10, 11, 15];
  // name variables after the weights
  var costTerms = _.map(costWeights, function (w) {
    return "#"+w;
  });
  var ws = Logic.weightedSum(costTerms, costWeights);
  s.require(Logic.lessThanOrEqual(ws, Logic.constantBits(19)));
  var sol = s.solve();
  var sol2 = s.maximize(sol, costTerms, costWeights, ws);
  test.equal(sol2.getTrueVars(), ["#11", "#2", "#5"]);
});

Tinytest.add("logic-solver - weightedSum", function (test) {
  var s = new Logic.Solver();
  s.require(Logic.equalBits(
    Logic.weightedSum(["A", "B"], [1, 4]),
    Logic.constantBits(5)));
  var sol = s.solve();
  test.isTrue(sol);
  test.equal(sol.getTrueVars(), ["A", "B"]);
});

Tinytest.add("logic-solver - type-checking", function (test) {
  // on by default
  test.throws(function () {
    Logic.or({});
  }, function (e) {
    return e instanceof Match.Error;
  });

  // ... but can turn it off (this shouldn't throw)
  Logic._disablingTypeChecks(function () {
    Logic.or({});
  });
});
