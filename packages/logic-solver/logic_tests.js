
Tinytest.add("logic-solver - require", function (test) {
  var s = new Logic.Solver;

  s.require('foo');
  test.equal(s._clauseData(), [[3]]);
  s.forbid('foo');
  test.equal(s._clauseData(), [[3], [-3]]);

  s.require([['foo'], '-bar'], '--foo', 'foo');
  test.equal(s._clauseData(), [[3], [-3], [3], [-4], [3], [3]]);
});

Tinytest.add("logic-solver - Logic.Or", function (test) {
  var s = new Logic.Solver;

  s.require(Logic.or('a', 'b'));
  test.equal(s._clauseData(), [[3, 4]]);

  s.require(Logic.or('-c', 'd', 3));
  test.equal(s._clauseData(), [[3, 4], [-5, 6, 3]]);

});
