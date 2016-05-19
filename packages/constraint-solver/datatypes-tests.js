var PV = PackageVersion;
var CS = ConstraintSolver;

Tinytest.add("constraint solver - datatypes - Dependency", function (test) {
  _.each(["foo", "foo@1.0.0"], function (foo) {
    var d1 = new CS.Dependency(PV.parsePackageConstraint(foo));
    test.equal(d1.packageConstraint.toString(), foo);
    test.equal(d1.isWeak, false);

    var d1 = new CS.Dependency(foo);
    test.equal(d1.packageConstraint.toString(), foo);
    test.equal(d1.isWeak, false);

    var d2 = new CS.Dependency(foo, { isWeak: false });
    test.equal(d2.packageConstraint.toString(), foo);
    test.equal(d2.isWeak, false);

    var d3 = new CS.Dependency(foo, { isWeak: true });
    test.equal(d3.packageConstraint.toString(), foo);
    test.equal(d3.isWeak, true);

    var d4 = CS.Dependency.fromString('?'+foo);
    test.equal(d4.packageConstraint.toString(), foo);
    test.equal(d4.isWeak, true);

    var d5 = CS.Dependency.fromString(foo);
    test.equal(d5.packageConstraint.toString(), foo);
    test.equal(d5.isWeak, false);
  });

  test.throws(function () {
    CS.Dependency.fromString('?');
  });

  test.throws(function () {
    new CS.Dependency("foo", "1.0.0");
  });
});
