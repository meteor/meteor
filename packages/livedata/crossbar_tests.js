// White box tests of invalidation crossbar matching function.
// Note: the current crossbar match function is designed specifically
// to ensure that a modification that targets a specific ID does not
// notify a query that is watching a different specific ID. (And to
// keep separate collections separate.) Other than that, there's no
// deep meaning to the matching function, and it could be changed later
// as long as it preserves that property.
Tinytest.add('livedata - crossbar', function (test) {
  var crossbar = new DDPServer._Crossbar;
  test.isTrue(crossbar._matches({collection: "C"},
                                {collection: "C"}));
  test.isTrue(crossbar._matches({collection: "C", id: "X"},
                                {collection: "C"}));
  test.isTrue(crossbar._matches({collection: "C"},
                                {collection: "C", id: "X"}));
  test.isTrue(crossbar._matches({collection: "C", id: "X"},
                                {collection: "C"}));

  test.isFalse(crossbar._matches({collection: "C", id: "X"},
                                 {collection: "C", id: "Y"}));
});
