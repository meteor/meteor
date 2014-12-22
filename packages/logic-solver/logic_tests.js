
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


Tinytest.add("logic-solver - Logic.Or", function (test) {
  var s = new Logic.Solver;

  s.require(Logic.or('A', 'B'));
  test.equal(s._clauseStrings(), ["A v B"]);

  s.require(Logic.or('-C', 'D', 3));
  test.equal(s._clauseData(), [[3, 4], [-5, 6, 3]]);
  test.equal(s._clauseStrings(), ["A v B", "-C v D v A"]);

  s.forbid(Logic.or('A', '-B'));
  test.equal(s._clauseStrings(), ["A v B", "-C v D v A",
                                  "-A", "B"]);
});
