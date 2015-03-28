Tinytest.add("spiderable - default hooks registered", function (test, expect) {
  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    2
  );
});

Tinytest.add("spiderable - is not ready while initial subscriptions aren't started", function (test, expect) {
  Spiderable._initialSubscriptionsStarted = false;
  test.equal(
    Spiderable.isReady(),
    false
  );
});

Tinytest.add("spiderable - is not ready while DDP Subscriptions aren't ready", function (test, expect) {
  original = DDP._allSubscriptionsReady;

  Spiderable._initialSubscriptionsStarted = true;
  DDP._allSubscriptionsReady = function(){return false};

  test.equal(
    Spiderable.isReady(),
    false
  );

  // restore original
  DDP._allSubscriptionsReady = original;
});

Tinytest.add("spiderable - default hooks can ready", function (test, expect) {
  original = DDP._allSubscriptionsReady;

  Spiderable._initialSubscriptionsStarted = true;
  DDP._allSubscriptionsReady = function(){return true};

  test.equal(
    Spiderable.isReady(),
    true
  );

  // restore original
  DDP._allSubscriptionsReady = original;
});

Tinytest.add("spiderable - is not ready with a custom hook", function (test, expect) {
  //clear all callbacks
  _.each(Spiderable._onReadyHook.callbacks, function(value,key,list){
    delete list[key];
  });

  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    0
  );

  Spiderable.onReady(function(){
    return false;
  });
  test.equal(
    Spiderable.isReady(),
    false
  );
});

Tinytest.add("spiderable - is ready with a custom hook", function (test, expect) {
  //clear all callbacks
  _.each(Spiderable._onReadyHook.callbacks, function(value,key,list){
    delete list[key];
  });

  test.equal(
    _.keys(Spiderable._onReadyHook.callbacks).length,
    0
  );

  Spiderable.onReady(function(){
    return true;
  });
  test.equal(
    Spiderable.isReady(),
    true
  );
});
