Tinytest.add("miniredis - reactivity - simple strings", function (test) {
  var S = new Miniredis.RedisStore();
  S.set("ab", "1");
  S.set("bb", "2");

  var aas = null;
  var c = Deps.autorun(function () {
    aas = S.patternFetch("a?");
  });

  test.equal(aas, ["1"]);

  S.set("ac", "2");
  Deps.flush();
  test.equal(aas, ["1", "2"]);

  S.set("ac", "5");
  Deps.flush();
  test.equal(aas, ["1", "5"]);

  S.set("ab", "4");
  Deps.flush();
  test.equal(aas, ["4", "5"]);

  S.set("bc", "3");
  Deps.flush();
  test.equal(aas, ["4", "5"]);

  S.set("bb", "5");
  Deps.flush();
  test.equal(aas, ["4", "5"]);

  S.del("ac");
  Deps.flush();
  test.equal(aas, ["4"]);

  S.set("ac", "12");
  Deps.flush();
  test.equal(aas, ["4", "12"]);
});

