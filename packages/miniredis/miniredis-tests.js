Tinytest.add("miniredis - pattern matching", function (test) {
  var regexp = null;
  function T (str) { test.isTrue(str.match(regexp)); }
  function F (str) { test.isFalse(str.match(regexp)); }

  regexp = MiniredisTest.patternToRegexp("H*llo");
  T("Hello");
  T("Hllo");
  T("Hallo");
  T("H123llo");
  T("H12  3llo");
  F("1H12  3llo");
  F("Hllo ");
  F(" Hllo ");

  regexp = MiniredisTest.patternToRegexp("Pattern");
  T("Pattern");
  F("pattern");
  F("Pattern ");

  regexp = MiniredisTest.patternToRegexp("Str?ngs");
  T("Strings");
  T("Strangs");
  T("Str5ngs");
  F("Strngs");
  F("Stringss");

  regexp = MiniredisTest.patternToRegexp("Varia**tio[^nNmM]");
  T("Variation");
  T("VariatioN");
  T("Variatiom");
  T("Varia66tio^");
  F("Variatio:");
  F("Variatio?");

  regexp = MiniredisTest.patternToRegexp("x?:()x");
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
});

