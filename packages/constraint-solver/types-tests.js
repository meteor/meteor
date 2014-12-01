Tinytest.add("constraint solver - types - CatalogCache", function (test) {
  var CatalogCache = ConstraintSolver.CatalogCache;
  var cache = new ConstraintSolver.CatalogCache();
  var Dep = ConstraintSolver.Dependency;
  var VC = ConstraintSolver.VersionConstraint;
  cache.addPackageVersion(
    'foo', '1.0.0', [new Dep('bar', '=2.0.0')]);
  cache.addPackageVersion(
    'foo', '1.0.1', [new Dep('bar', new VC('=2.0.0 || =2.0.1'))]);

  test.throws(function () {
    // can't add deps twice
    cache.addPackageVersion(
      'foo', '1.0.0', [new Dep('baz', '1.0.0')]);
  });

  test.equal(cache.toJSONable(), {
    data: {
      'foo 1.0.0': ['bar@=2.0.0'],
      'foo 1.0.1': ['bar@=2.0.0 || =2.0.1']
    } });
  test.equal(CatalogCache.fromJSONable(cache.toJSONable()).toJSONable(), {
    data: {
      'foo 1.0.0': ['bar@=2.0.0'],
      'foo 1.0.1': ['bar@=2.0.0 || =2.0.1']
    } });
});
