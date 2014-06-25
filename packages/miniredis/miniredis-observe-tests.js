var log_callbacks = function (operations) {
  return {
    added: function (obj) {
      operations.push(EJSON.clone(['added', obj._id, obj.value]));
    },
    changed: function (obj, old_obj) {
      operations.push(EJSON.clone(['changed', obj._id, obj.value, old_obj.value]));
    },
    removed: function (old_obj) {
      operations.push(EJSON.clone(['removed', old_obj._id, old_obj.value]));
    }
  };
};


Tinytest.add("miniredis - observe - simple strings", function (test) {
  var S = new Miniredis.RedisStore();

  S.set("aa", "123");
  S.set("ab", "421");
  S.set("cb", "abc");

  var events = [];
  var h = S.matching("a?").observe({
    added: function (doc) {
      events.push({ event: "added", key: doc._id, value: doc.value });
    },
    changed: function (newDoc, oldDoc) {
      events.push({ event: "changed", key: newDoc._id,
                    value: newDoc.value, oldValue: oldDoc.value });
    },
    removed: function (doc) {
      events.push({ event: "removed", key: doc._id, value: doc.value });
    }
  });

  test.length(events, 2);
  test.equal(events.shift(), { event: "added", key: "aa", value: "123" });
  test.equal(events.shift(), { event: "added", key: "ab", value: "421" });

  S.set("aa", "123");
  S.set("ab", "333");
  S.del("cb");
  S.set("cbs", "tbbt");

  test.length(events, 1);
  test.equal(events.shift(), { event: "changed", key: "ab", value: "333", oldValue: "421" });

  S.del("aa");
  test.length(events, 1);
  test.equal(events.shift(), { event: "removed", key: "aa", value: "123" });

  h.stop();

  S.set("aaa", "should not show up");
  test.length(events, 0);
});

Tinytest.add("miniredis - observe - observeChanges on strings", function (test) {
  var S = new Miniredis.RedisStore();

  S.set("aa", "123");
  S.set("ab", "421");
  S.set("cb", "abc");

  var events = [];
  var h = S.matching("a?").observeChanges({
    added: function (key, fields) {
      events.push({ event: "added", key: key, value: fields.value });
    },
    changed: function (key, fields) {
      events.push({ event: "changed", key: key, value: fields.value });
    },
    removed: function (key) {
      events.push({ event: "removed", key: key });
    }
  });

  test.length(events, 2);
  test.equal(events.shift(), { event: "added", key: "aa", value: "123" });
  test.equal(events.shift(), { event: "added", key: "ab", value: "421" });

  S.set("aa", "123");
  S.set("ab", "333");
  S.del("cb");
  S.set("cbs", "tbbt");

  test.length(events, 1);
  test.equal(events.shift(), { event: "changed", key: "ab", value: "333" });

  S.del("aa");
  test.length(events, 1);
  test.equal(events.shift(), { event: "removed", key: "aa" });

  h.stop();

  S.set("aaa", "should not show up");
  test.length(events, 0);
});



Tinytest.add("miniredis - observe - pause", function (test) {
  var operations = [];
  var cbs = log_callbacks(operations);

  var S = new Miniredis.RedisStore();
  var h = S.matching("*").observe(cbs);


  // sanity test for simple add.
  S.set("Add", "1");
  test.equal(operations.shift(), ['added', 'Add', '1']);

  S.pauseObservers();

  S.set("Add2", "2");
  test.length(operations, 0);

  S.resumeObservers();
  test.equal(operations.shift(), ['added', 'Add2', '2']);

  // remove then add cancel out.
  S.set("RemoveThenAdd", "1");
  test.equal(operations.shift(), ['added', 'RemoveThenAdd', '1']);

  S.pauseObservers();

  S.del("RemoveThenAdd");
  test.length(operations, 0);
  S.set("RemoveThenAdd", "1");
  test.length(operations, 0);

  S.resumeObservers();
  test.length(operations, 0);

  // add then remove cancels out
  S.pauseObservers();

  S.set("AddThenRemove", "1");
  test.length(operations, 0);
  S.del("AddThenRemove");
  test.length(operations, 0);

  S.resumeObservers();
  test.length(operations, 0);


  // two modifications become one
  S.set("ModMod", "1");
  test.equal(operations.shift(), ['added', "ModMod", "1"]);
  S.pauseObservers();

  S.set("ModMod", "2");
  S.set("ModMod", "3");

  S.resumeObservers();
  test.equal(operations.shift(), ['changed', "ModMod", "3", "1"]);
  test.length(operations, 0);

  // A -> B -> A cancels out
  S.set("ABA", "1");
  test.equal(operations.shift(), ['added', "ABA", "1"]);
  S.pauseObservers();

  S.set("ABA", "2");
  S.set("ABA", "1");

  S.resumeObservers();
  test.length(operations, 0);

  // XXX: implement flushall?
//  // test special case for remove({})
//  S.pauseObservers();
//  test.equal(S.remove({}), 1);
//  test.length(operations, 0);
//  S.resumeObservers();
//  test.equal(operations.shift(), ['removed', 1, 0, {a:3}]);
//  test.length(operations, 0);

  h.stop();
});
