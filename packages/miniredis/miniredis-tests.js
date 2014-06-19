Tinytest.add("miniredis - pattern matching", function (test) {
  var regexp = null;
  function T (str) { test.isTrue(str.match(regexp)); }
  function F (str) { test.isFalse(str.match(regexp)); }

  regexp = Miniredis.patternToRegexp("H*llo");
  T("Hello");
  T("Hllo");
  T("Hallo");
  T("H123llo");
  T("H12  3llo");
  F("1H12  3llo");
  F("Hllo ");
  F(" Hllo ");

  regexp = Miniredis.patternToRegexp("Pattern");
  T("Pattern");
  F("pattern");
  F("Pattern ");

  regexp = Miniredis.patternToRegexp("Str?ngs");
  T("Strings");
  T("Strangs");
  T("Str5ngs");
  F("Strngs");
  F("Stringss");

  regexp = Miniredis.patternToRegexp("Varia**tio[^nNmM]");
  T("Variation");
  T("VariatioN");
  T("Variatiom");
  T("Varia66tio^");
  F("Variatio:");
  F("Variatio?");

  regexp = Miniredis.patternToRegexp("x?:()x");
  T("xA:()x");
  T("x.:()x");
  F("x.:)(x");
});

Tinytest.add("miniredis - strings operations", function (test) {
  var S = new Miniredis.RedisStore();

  test.equal(S.get("key"), null);
  S.set("key", 123);
  test.equal(S.get("key"), "123");
  test.equal(S.append("key", "45"), 5);
  test.equal(S.get("key"), "12345");
  S.incrby("key", 4);
  test.equal(S.get("key"), "12349");
  S.decrby("key", "11");
  test.equal(S.get("key"), "12338");
  test.equal(S.strlen("key"), 5);
  test.equal(S.getrange("key", -3, -1), "338");
  test.equal(S.getset("key", "newstring"), "12338");
  test.equal(S.get("key"), "newstring");
});

Tinytest.add("miniredis - lists operations", function (test) {
  var S = new Miniredis.RedisStore();
  test.equal(S.get("k"), null);
  S.lpushx("k", "0");
  test.equal(S.get("k"), null);
  S.rpushx("k", "0");
  test.equal(S.get("k"), null);
  S.rpush("k", "1");
  test.throws(function () { S.get("k"); }, /wrong kind/);
  test.equal(S.lindex("k", 0), "1");
  S.lpushx("k", 0);
  test.equal(S.lindex("k", 0), "0");
  S.lpush("k", "a");
  test.equal(S.lindex("k", 0), "a");
  test.equal(S.lindex("k", 1), "0");
  test.equal(S.lindex("k", 2), "1");
  S.rpush("k", 2, 3, 4, 5);
  test.equal(S.lindex("k", 3), "2");
  test.equal(S.lindex("k", 4), "3");
  test.equal(S.lindex("k", 5), "4");
  test.equal(S.lindex("k", 6), "5");
  test.equal(S.llen("k"), 7);
  test.equal(S.lrange("k", 2, -2), ["1", "2", "3", "4"]);
  S.linsert("k", "BEFORE", "0", "-1");
  test.equal(S.lrange("k", 0, 7), ["a", "-1", "0", "1", "2", "3", "4", "5"]);
  S.linsert("k", "AFTER", "a", "b");
  test.equal(S.lrange("k", 0, 8), ["a", "b", "-1", "0", "1", "2", "3", "4", "5"]);
  test.equal(S.lpop("k"), "a");
  test.equal(S.lpop("k"), "b");
  test.equal(S.lpop("k"), "-1");
  test.equal(S.llen("k"), 6);
  test.equal(S.rpop("k"), "5");
  test.equal(S.rpop("k"), "4");
  test.equal(S.llen("k"), 4);
  S.lset("k", "2", "3");
  test.equal(S.lrange("k", 0, 3), ["0", "1", "3", "3"]);
  // XXX implement and test LREM
});

