// This is a magic collection that fails its writes on the server when
// the selector (or inserted document) contains fail: true.

// XXX namespacing
Meteor._FailureTestCollection =
  new Meteor.Collection("___meteor_failure_test_collection");

testAsyncMulti("mongo-livedata - database failure reporting", [
  function (test, expect) {
    var ftc = Meteor._FailureTestCollection;

    var exception = function (err) {
      test.instanceOf(err, Error);
    };

    _.each(["insert", "remove", "update"], function (op) {
      if (Meteor.is_server) {
        test.throws(function () {
          ftc[op]({fail: true});
        });

        ftc[op]({fail: true}, expect(exception));
      }

      if (Meteor.is_client) {
        ftc[op]({fail: true}, expect(exception));

        // This would log to console in normal operation.
        Meteor._suppress_log(1);
        ftc[op]({fail: true});
      }
    });
  }
]);
