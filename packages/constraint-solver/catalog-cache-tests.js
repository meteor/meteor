var CS = ConstraintSolver;

Tinytest.add("constraint solver - CatalogCache", function (test) {
  var cache = new CS.CatalogCache();

  // add package versions out of order; they'll be sorted
  // when retrieved with getPackageVersions or eachPackage
  // (but not eachPackageVersion).
  cache.addPackageVersion(
    'foo', '1.0.1', [new CS.Dependency('bar@=2.0.0 || =2.0.1'),
                     new CS.Dependency('bzzz'),
                     new CS.Dependency('weakly1@1.0.0', {isWeak: true}),
                     new CS.Dependency('weakly2', {isWeak: true})]);
  cache.addPackageVersion(
    'foo', '1.0.0', [new CS.Dependency('bar@=2.0.0')]);

  test.throws(function () {
    // can't add deps twice
    cache.addPackageVersion(
      'foo', '1.0.0', [new CS.Dependency('blah@1.0.0')]);
  });

  test.equal(cache.toJSONable(), {
    data: {
      'foo 1.0.0': ['bar@=2.0.0'],
      'foo 1.0.1': ['bar@=2.0.0 || =2.0.1', 'bzzz',
                    '?weakly1@1.0.0', '?weakly2']
    } });
  test.equal(CS.CatalogCache.fromJSONable(cache.toJSONable()).toJSONable(), {
    data: {
      'foo 1.0.0': ['bar@=2.0.0'],
      'foo 1.0.1': ['bar@=2.0.0 || =2.0.1', 'bzzz',
                    '?weakly1@1.0.0', '?weakly2']
    } });

  var pvs = {};
  cache.eachPackageVersion(function (pv, deps) {
    check(pv, CS.PackageAndVersion);
    check(_.values(deps), [CS.Dependency]);
    pvs[pv.package+' '+pv.version] = _.keys(deps).sort();
  });
  test.equal(pvs, {'foo 1.0.0': ['bar'],
                   'foo 1.0.1': ['bar', 'bzzz', 'weakly1', 'weakly2']});

  var count = 0;
  cache.eachPackageVersion(function (pv) {
    count++;
    return true; // stop
  });
  test.equal(count, 1);

  var foos = [];
  _.each(cache.getPackageVersions('foo'), function (v) {
    var depMap = cache.getDependencyMap('foo', v);
    foos.push([v, _.map(depMap, String).sort()]);
  });
  // versions should come out sorted, just like this.
  test.equal(foos,
             [['1.0.0', ['bar@=2.0.0']],
              ['1.0.1', ['?weakly1@1.0.0', '?weakly2',
                         'bar@=2.0.0 || =2.0.1', 'bzzz']]]);

  test.throws(function () {
    // package version doesn't exist
    cache.getDependencyMap('foo', '7.0.0');
  });

});
