
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
  // test this canonicalization that is part of _toName
  // (though not actually used by _clauseStrings because
  // Clauses use numeric Terms).
  test.equal(s._toName("-----foo"), "-foo");

  test.equal(s._clauseStrings(), ["foo"]);
  s.require('-myPackage 1.0.0');
  test.equal(s._clauseStrings(), ["foo", '-"myPackage 1.0.0"']);
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

Tinytest.add("logic-solver - Logic.Or", function (test) {
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
