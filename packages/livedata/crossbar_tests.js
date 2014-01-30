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

  // Test that stopped listens definitely don't fire.
  var calledFirst = false;
  var calledSecond = false;
  var trigger = {collection: "C"};
  var secondHandle;
  crossbar.listen(trigger, function (notification) {
    // This test assumes that listeners will be called in the order
    // registered. It's not wrong for the crossbar to do something different,
    // but the test won't be valid in that case, so make it fail so we notice.
    calledFirst = true;
    if (calledSecond) {
      test.fail({
        type: "test_assumption_failed",
        message: "test assumed that listeners would be called in the order registered"
      });
    } else {
      secondHandle.stop();
    }
  });
  secondHandle = crossbar.listen(trigger, function (notification) {
    // This should not get invoked, because it should be stopped by the other
    // listener!
    calledSecond = true;
  });
  crossbar.fire(trigger);
  test.isTrue(calledFirst);
  test.isFalse(calledSecond);
});
