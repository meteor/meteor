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

// XXX namespacing
Meteor._LivedataTestCollection =
  new Meteor.Collection("livedata_test_collection");

Tinytest.add("mongo-livedata - basics", function (test) {
  var coll = Meteor._LivedataTestCollection;
  var run = test.runId();

  var log = '';
  var obs = coll.find({run: run}, {sort: ["x"]}).observe({
    added: function (doc, before_index) {
      log += 'a(' + doc.x + ',' + before_index + ')';
    },
    changed: function (new_doc, at_index, old_doc) {
      log += 'c(' + new_doc.x + ',' + at_index + ',' + old_doc.x + ')';
    },
    moved: function (doc, old_index, new_index) {
      log += 'm(' + doc.x + ',' + old_index + ',' + new_index + ')';
    },
    removed: function (doc, at_index) {
      log += 'r(' + doc.x + ',' + at_index + ')';
    }
  });

  var expectObserve = function (expected, f) {
    if (Meteor.is_client) {
      f();
    } else {
      var fence = new Meteor._WriteFence;
      Meteor._CurrentWriteFence.withValue(fence, f);
      var future = new Future;
      fence.onAllCommitted(function () {
        future['return']();
      });
      fence.arm();
      future.wait();
    }

    if (!(expected instanceof Array))
      expected = [expected];

    test.include(expected, log);
    log = '';
  };

  test.equal(coll.find({run: run}).count(), 0);
  test.equal(coll.findOne("abc"), undefined);
  test.equal(coll.findOne({run: run}), undefined);

  expectObserve('a(1,0)', function () {
    var id = coll.insert({run: run, x: 1});
    test.equal(id.length, 36);
    test.equal(coll.find({run: run}).count(), 1);
    test.equal(coll.findOne(id).x, 1);
    test.equal(coll.findOne({run: run}).x, 1);
  });

  expectObserve('a(4,1)', function () {
    var id2 = coll.insert({run: run, x: 4});
    test.equal(coll.find({run: run}).count(), 2);
    test.equal(coll.find({_id: id2}).count(), 1);
    test.equal(coll.findOne(id2).x, 4);
  });

  test.equal(coll.findOne({run: run}, {sort: ["x"], skip: 0}).x, 1);
  test.equal(coll.findOne({run: run}, {sort: ["x"], skip: 1}).x, 4);
  test.equal(coll.findOne({run: run}, {sort: {x: -1}, skip: 0}).x, 4);
  test.equal(coll.findOne({run: run}, {sort: {x: -1}, skip: 1}).x, 1);

  var cur = coll.find({run: run}, {sort: ["x"]});
  var total = 0;
  cur.forEach(function (doc) {
    total *= 10;
    total += doc.x;
  })
  test.equal(total, 14);

  cur.rewind();
  test.equal(cur.map(function (doc) {
    return doc.x * 2;
  }), [2, 8]);

  test.equal(_.pluck(coll.find({run: run}, {sort: {x: -1}}).fetch(), "x"),
             [4, 1]);

  expectObserve('c(3,0,1)c(6,1,4)', function () {
    coll.update({run: run}, {$inc: {x: 2}}, {multi: true});
    test.equal(_.pluck(coll.find({run: run}, {sort: {x: -1}}).fetch(), "x"),
               [6, 3]);
  });

  expectObserve(['c(13,0,3)m(13,0,1)', 'm(6,1,0)c(13,1,3)'], function () {
    coll.update({run: run, x: 3}, {$inc: {x: 10}}, {multi: true});
    test.equal(_.pluck(coll.find({run: run}, {sort: {x: -1}}).fetch(), "x"),
               [13, 6]);
  });

  expectObserve('r(13,1)', function () {
    coll.remove({run: run, x: {$gt: 10}});
    test.equal(coll.find({run: run}).count(), 1);
  });

  expectObserve('r(6,0)', function () {
    coll.remove({run: run});
    test.equal(coll.find({run: run}).count(), 0);
  });

  obs.stop();
});