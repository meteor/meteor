Tinytest.add("spiderable - default hooks registered", function (test, expect) {
  test.equal(Spiderable._onReadyHook.size(), 2);
});

Tinytest.add("spiderable - is not ready while initial subscriptions aren't started", function (test, expect) {
  var original = Spiderable._initialSubscriptionsStarted;

  Spiderable._initialSubscriptionsStarted = false;
  test.isFalse(Spiderable.isReady());

  Spiderable._initialSubscriptionsStarted = original;
});

Tinytest.add("spiderable - is not ready while DDP Subscriptions aren't ready", function (test, expect) {
  var original = DDP._allSubscriptionsReady;

  Spiderable._initialSubscriptionsStarted = true;
  DDP._allSubscriptionsReady = function () { return false; };

  test.isFalse(Spiderable.isReady());

  // restore original
  DDP._allSubscriptionsReady = original;
});

Tinytest.add("spiderable - default hooks can ready", function (test, expect) {
  var original = DDP._allSubscriptionsReady;

  Spiderable._initialSubscriptionsStarted = true;
  DDP._allSubscriptionsReady = function () { return true; };

  test.isTrue(Spiderable.isReady());

  // restore original
  DDP._allSubscriptionsReady = original;
});

Tinytest.add("spiderable - is not ready with a custom hook", function (test, expect) {
  test.equal(Spiderable._onReadyHook.size(), 2);

  //clear all/default callbacks
  var callbacks = Spiderable._onReadyHook.asArray()
  Spiderable._onReadyHook.clear();
  test.equal(Spiderable._onReadyHook.size(), 0);


  // actually test not ready
  Spiderable.addReadyCondition(function () { return false; });
  test.isFalse(Spiderable.isReady());


  // clear new callback
  Spiderable._onReadyHook.clear();
  test.equal(Spiderable._onReadyHook.size(), 0);

  // restore callbacks
  Spiderable._onReadyHook.fromArray(callbacks);
  test.equal(Spiderable._onReadyHook.size(), 2);
});

Tinytest.add("spiderable - is ready with a custom hook", function (test, expect) {
  test.equal(Spiderable._onReadyHook.size(), 2);

  //clear all callbacks
  var callbacks = Spiderable._onReadyHook.asArray();
  Spiderable._onReadyHook.clear();
  test.equal(Spiderable._onReadyHook.size(), 0);

  // actually test ready
  Spiderable.addReadyCondition(function () { return true; });
  test.isTrue(Spiderable.isReady());


  // clear new callback
  Spiderable._onReadyHook.clear();
  test.equal(Spiderable._onReadyHook.size(), 0);

  // restore callbacks
  Spiderable._onReadyHook.fromArray(callbacks);
  test.equal(Spiderable._onReadyHook.size(), 2);
});
