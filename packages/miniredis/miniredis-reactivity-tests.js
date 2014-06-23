Tinytest.add("miniredis - reactivity - simple strings, pattern", function (test) {
  var S = new Miniredis.RedisStore();
  S.set("ab", "1");
  S.set("bb", "2");

  var values = null;
  var keys = null;
  var c = Deps.autorun(function () {
    values = _.pluck(S.matching("a?").fetch(), 'value');
    keys = _.pluck(S.matching("a?").fetch(), 'key');
  });

  test.equal(values, ["1"]);
  test.equal(keys, ["ab"]);

  S.set("ac", "2");
  Deps.flush();
  test.equal(values, ["1", "2"]);
  test.equal(keys, ["ab", "ac"]);

  S.set("ac", "5");
  Deps.flush();
  test.equal(values, ["1", "5"]);
  test.equal(keys, ["ab", "ac"]);

  S.set("ab", "4");
  Deps.flush();
  test.equal(values, ["4", "5"]);
  test.equal(keys, ["ab", "ac"]);

  S.set("bc", "3");
  Deps.flush();
  test.equal(values, ["4", "5"]);
  test.equal(keys, ["ab", "ac"]);

  S.set("bb", "5");
  Deps.flush();
  test.equal(values, ["4", "5"]);
  test.equal(keys, ["ab", "ac"]);

  S.del("ac");
  Deps.flush();
  test.equal(values, ["4"]);
  test.equal(keys, ["ab"]);

  S.set("ac", "12");
  Deps.flush();
  test.equal(values, ["4", "12"]);
  test.equal(keys, ["ab", "ac"]);

  S.del("ab");
  S.del("ac");
  S.del("bb");
  S.del("bc");
  Deps.flush();
  test.equal(_.keys(S._keyDependencies).length, 0, "keys are removed and so should be the deps");
  c.stop();
  Deps.flush();
  test.equal(_.keys(S._keyDependencies).length +
             _.keys(S._patternDependencies).length, 0,
    "All dependencies are unset as there are no more computations");

  test.equal(keys, []);
});

Tinytest.add("miniredis - reactivity - simple strings, single", function (test) {
  var S = new Miniredis.RedisStore();

  var magic = null;
  var c = Deps.autorun(function () {
    magic = S.get("magic");
  });

  test.equal(magic, undefined);

  S.set("magic", "abcd");
  Deps.flush();
  test.equal(magic, "abcd");

  S.set("magic", "debc");
  Deps.flush();
  test.equal(magic, "debc");

  S.del("magic");
  Deps.flush();
  test.equal(magic, undefined);

  S.set("magic", "123");
  Deps.flush();
  test.equal(magic, "123");

  c.stop();
  Deps.flush();
  test.equal(_.keys(S._keyDependencies).length +
             _.keys(S._patternDependencies).length, 0,
    "All dependencies are unset as there are no more computations");
});

Tinytest.add("miniredis - reactivity - simple lists, single", function (test) {
  var S = new Miniredis.RedisStore();
  S.lpush("listA", "1");
  S.lpush("listA", "0");

  var lists = null;
  var keys = null;
  var c = Deps.autorun(function () {
    lists = _.pluck(S.matching("list[ABC]").fetch(), 'value');
    keys = _.pluck(S.matching("list[ABC]").fetch(), 'key');
  });

  test.equal(lists, [["0", "1"]]);
  test.equal(keys, ["listA"]);

  S.rpush("listA", "2");
  Deps.flush();
  test.equal(lists, [["0", "1", "2"]]);
  test.equal(keys, ["listA"]);

  S.rpush("listB", "A");
  Deps.flush();
  test.equal(lists, [["0", "1", "2"], ["A"]]);
  test.equal(keys, ["listA", "listB"]);

  S.lset("listB", 0, "B");
  Deps.flush();
  test.equal(lists, [["0", "1", "2"], ["B"]]);
  test.equal(keys, ["listA", "listB"]);

  S.lpush("listD", 0, "nono");
  Deps.flush();
  test.equal(lists, [["0", "1", "2"], ["B"]]);
  test.equal(keys, ["listA", "listB"]);
});

