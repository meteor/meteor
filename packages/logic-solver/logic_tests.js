
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

Tinytest.add("logic-solver - toNameTerm", function (test) {
  var s = new Logic.Solver;
  test.equal(s.toNameTerm("-----foo"), "-foo");
});

var checkClauses = function (test, f, expected) {
  check(f, Function);
  check(expected, [String]);
  var s = new Logic.Solver;
  f(s);
  test.equal(s._clauseStrings(), expected);
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
    // Clauses that forbid `F and require `T are automatically
    // generated as the first two clauses.  Using each of them
    // causes the relevant clause to be included in the output.
    function (s) {
      s.require(Logic.not(Logic.TRUE));
    },
    ["`T", "-`T"],
    function (s) {
      s.require(Logic.or(Logic.not(Logic.TRUE),
                         Logic.not(Logic.FALSE)));
    },
    ["-`F", "`T", "-`T v -`F"]
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
