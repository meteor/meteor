Tinytest.add("miniredis - observe - simple strings", function (test) {
  var S = new Miniredis.RedisStore();

  S.set("aa", "123");
  S.set("ab", "421");
  S.set("cb", "abc");

  var events = [];
  var h = S.matching("a?").observeChanges({
    added: function (key, value) {
      events.push({ event: "added", key: key, value: value });
    },
    changed: function (key, value) {
      events.push({ event: "changed", key: key, value: value });
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

