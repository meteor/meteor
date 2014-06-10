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
    changed: function (oldDoc, newDoc) {
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

