Tinytest.add("spiderable - default hooks registered", function (test, expect) {
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    2
  );
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
  var callbacks = {}
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    2
  );

  //clear all/default callbacks
  _.each(Spiderable._onReadyHook.callbacks, function (value,key,list) {
    callbacks[key] = value;
    delete list[key];
  });
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    0
  );


  // actually test not ready
  Spiderable.addReadyCondition(function () { return false; });
  test.isFalse(Spiderable.isReady());


  // clear new callback
  _.each(Spiderable._onReadyHook.callbacks, function (value,key,list) {
    delete list[key];
  });
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    0
  );

  // restore callbacks
  _.each(callbacks, function (value,key,list) {
    Spiderable._onReadyHook.callbacks[key] = value;
  });
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    2
  );
});

Tinytest.add("spiderable - is ready with a custom hook", function (test, expect) {
  var callbacks = {}
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    2
  );

  //clear all callbacks
  _.each(Spiderable._onReadyHook.callbacks, function (value,key,list) {
    callbacks[key] = value;
    delete list[key];
  });
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    0
  );


  // actually test ready
  Spiderable.addReadyCondition(function () { return true; });
  test.isTrue(Spiderable.isReady());


  // clear new callback
  _.each(Spiderable._onReadyHook.callbacks, function (value,key,list) {
    delete list[key];
  });
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    0
  );

  // restore callbacks
  _.each(callbacks, function (value,key,list) {
    Spiderable._onReadyHook.callbacks[key] = value;
  });
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    2
  );
});
