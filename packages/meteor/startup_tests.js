Tinytest.addAsync("startup - ordering", function(test, onComplete) {
  var state = 0;

  var callback1 = function () {
    test.equal(state, 0);
    state = 1;
    // This callback is sneaky.  callback2 should still be called before callback3,
    // because callback2 is registered first
    Meteor.startup(function () { callback3(); });
  };

  var callback2 = function () {
    test.equal(state, 1);
    state = 2;
  };

  var callback3 = function () {
    test.equal(state, 2);
    state = 3;
    onComplete();
  };

  // Callback should be async, even when we're done loading
  Meteor.startup(function () { callback1(); });
  test.equal(state, 0);

  // callbacks should be handled in the order they were received
  Meteor.startup(function () { callback2(); });

  // Just to be sure
  test.equal(state, 0);
});


