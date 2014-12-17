Tinytest.add("constraint solver - types - CatalogCache", function (test) {
  var CatalogCache = ConstraintSolver.CatalogCache;
  var cache = new ConstraintSolver.CatalogCache();
  var Dep = ConstraintSolver.Dependency;
  var VC = ConstraintSolver.VersionConstraint;
  cache.addPackageVersion(
    'foo', '1.0.0', [new Dep('bar', '=2.0.0')]);
  cache.addPackageVersion(
    'foo', '1.0.1', [new Dep('bar', new VC('=2.0.0 || =2.0.1')),
                     new Dep('bzzz'),
                     new Dep('weakly1', '1.0.0', {weak: true}),
                     new Dep('weakly2', null, {weak: true})]);

  test.throws(function () {
    // can't add deps twice
    cache.addPackageVersion(
      'foo', '1.0.0', [new Dep('blah', '1.0.0')]);
  });

  test.equal(cache.toJSONable(), {
    data: {
      'foo 1.0.0': ['bar@=2.0.0'],
      'foo 1.0.1': ['bar@=2.0.0 || =2.0.1', 'bzzz',
                    '?weakly1@1.0.0', '?weakly2']
    } });
  test.equal(CatalogCache.fromJSONable(cache.toJSONable()).toJSONable(), {
    data: {
      'foo 1.0.0': ['bar@=2.0.0'],
      'foo 1.0.1': ['bar@=2.0.0 || =2.0.1', 'bzzz',
                    '?weakly1@1.0.0', '?weakly2']
    } });

  var pvs = [];
  cache.eachPackageVersion(function (pv, deps) {
    check(pv, ConstraintSolver.PackageVersion);
    pvs.push([pv.package, pv.version, _.keys(deps)]);
  });
  test.equal(pvs, [['foo', '1.0.0', ['bar']],
                   ['foo', '1.0.1', ['bar', 'bzzz', 'weakly1', 'weakly2']]]);

  var count = 0;
  cache.eachPackageVersion(function (pv) {
    count++;
    return true; // stop
  });
  test.equal(count, 1);

  var foos = [];
  _.each(cache.getPackageVersions('foo'), function (v) {
    var depMap = cache.getDependencyMap('foo', v);
    foos.push([v, _.map(depMap, String)]);
  });
  test.equal(foos,
             [['1.0.0', ['bar@=2.0.0']],
              ['1.0.1', ['bar@=2.0.0 || =2.0.1', 'bzzz',
                         '?weakly1@1.0.0', '?weakly2']]]);

  test.throws(function () {
    // package version doesn't exist
    cache.getDependencyMap('foo', '7.0.0');
  });
});

Tinytest.add("constraint solver - types - Dependency", function (test) {
  var d1 = new ConstraintSolver.Dependency('ham', '1.0.0');
  test.equal(d1.package, 'ham');
  check(d1.constraint, ConstraintSolver.VersionConstraint);
  test.equal(d1.constraint.toString(), '1.0.0');
  test.isFalse(d1.weak);
  test.equal(d1.toString(), 'ham@1.0.0');
  d1 = ConstraintSolver.Dependency.fromString(d1.toString());
  check(d1.constraint, ConstraintSolver.VersionConstraint);
  test.equal(d1.constraint.toString(), '1.0.0');
  test.isFalse(d1.weak);
  test.equal(d1.toString(), 'ham@1.0.0');

  var d2 = new ConstraintSolver.Dependency('ham', '2.0.0', {weak: true});
  test.equal(d2.package, 'ham');
  test.equal(d2.constraint.toString(), '2.0.0');
  test.isTrue(d2.weak);
  test.equal(d2.toString(), '?ham@2.0.0');
  d2 = ConstraintSolver.Dependency.fromString(d2.toString());
  test.equal(d2.package, 'ham');
  test.equal(d2.constraint.toString(), '2.0.0');
  test.isTrue(d2.weak);
  test.equal(d2.toString(), '?ham@2.0.0');

  var d3 = new ConstraintSolver.Dependency('ham');
  test.equal(d3.package, 'ham');
  test.equal(d3.constraint, null);
  test.isFalse(d3.weak);
  test.equal(d3.toString(), 'ham');
  d3 = ConstraintSolver.Dependency.fromString(d3.toString());
  test.equal(d3.package, 'ham');
  test.equal(d3.constraint, null);
  test.isFalse(d3.weak);
  test.equal(d3.toString(), 'ham');

  var d4 = new ConstraintSolver.Dependency('ham', null, {weak: true});
  test.equal(d4.package, 'ham');
  test.equal(d4.constraint, null);
  test.isTrue(d4.weak);
  test.equal(d4.toString(), '?ham');
  d4 = ConstraintSolver.Dependency.fromString(d4.toString());
  test.equal(d4.package, 'ham');
  test.equal(d4.constraint, null);
  test.isTrue(d4.weak);
  test.equal(d4.toString(), '?ham');

  test.throws(function () {
    // second argument is not optional
    new ConstraintSolver.Dependency('ham', {weak: true});
  });
});

Tinytest.add("constraint solver - types - VersionConstraint NEW", function (test) {
  var VC = ConstraintSolver.VersionConstraint;

  var satisfies = function (v, constraint, doesIt) {
    test.equal(new VC(constraint).isSatisfiedBy(v), doesIt);
  };

  satisfies('1.0.0', '1.0.0', true);
  satisfies('1.0.1', '1.0.0', true);
  satisfies('1.0.1', '1.0.1', true);
  satisfies('1.0.2', '1.0.1', true);
  satisfies('1.0.0', '1.0.1', false);
  satisfies('2.0.0', '1.0.0', false);
  satisfies('1.9.9', '1.0.0', true);
  satisfies('1.10.0', '1.9.0', true);
  satisfies('2.5.0', '1.0.0 || 2.0.0 || 3.0.0', true);
  satisfies('3.5.0', '1.0.0 || 2.0.0 || 3.0.0', true);
  satisfies('4.5.0', '1.0.0 || 2.0.0 || 3.0.0', false);
});
