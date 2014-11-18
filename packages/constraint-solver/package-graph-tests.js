var PackageGraph = ConstraintSolver.PackageGraph;

Tinytest.add("constraint-solver - PackageGraph - rep", function (test) {
  var makeGraph = function (data) {
    var G = new PackageGraph(data);
    test.equal(G.getData(), data || {});
    return G;
  };

  makeGraph({
    'foo@1.0.0': {
      bar: { constraint: '0.7.0',
             depArchs: ['os', 'web'] }
    },
    'foo@1.0.1': {
      bar: { constraint: '0.7.8',
             depArchs: ['os', 'web'] }
    },
    'foo@2.0.0': {
      bar: { constraint: '=0.7.10',
             depArchs: ['os', 'web'] }
    },
    'bar@0.7.8': {},
    'bar@0.7.9': {},
    'bar@0.7.10': {}
  });

  // these don't throw any errors
  makeGraph();
  makeGraph({});
  makeGraph({ 'foo@1.0.0': {} });

  test.throws(function () {
    // no '@' in key
    makeGraph({ foo: {} });
  });

  test.throws(function () {
    // bad value
    makeGraph({ foo: null });
  });

  makeGraph({ 'foo@1.0.0': { bar: { constraint: '2.0.0' } } });
  makeGraph({ 'foo@1.0.0': { bar: { constraint: '2.0.0' } } });
  makeGraph({ 'foo@1.0.0': { bar: { depArchs: ['os'] } } });
  test.throws(function () {
    // bad dependency (must have "constraint" or "depArchs")
    makeGraph({ 'foo@1.0.0': { bar: {} } });
  });
  test.throws(function () {
    // bad dependency (constraint can't be null)
    makeGraph({ 'foo@1.0.0': { bar: { constraint: null } } });
  });
  test.throws(function () {
    // bad dependency (can't have '@' in package2)
    makeGraph({ 'foo@1.0.0': { 'bar@2.0.0': { depArchs: ['os'] } } });
  });
});

Tinytest.add("constraint-solver - PackageGraph - addPackageVersion", function (test) {
  var G = new PackageGraph();
  test.equal(G.getData(), {});
  test.equal(G.addPackageVersion('foo', '1.0.0'), true);
  test.equal(G.getData(), { 'foo@1.0.0': {} });
  test.equal(G.addPackageVersion('foo', '1.0.0'), false);
  test.equal(G.getData(), { 'foo@1.0.0': {} });
  test.equal(G.addPackageVersion('foo', '1.0.1'), true);
  test.equal(G.getData(), { 'foo@1.0.0': {}, 'foo@1.0.1': {} });
});
