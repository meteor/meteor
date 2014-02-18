Tinytest.add("binary-heap - simple heap tests", function (test) {
  var h = new BinaryHeap(function (a, b) { return a-b; });
  h.set("a", 1);
  h.set("b", 233);
  h.set("c", -122);
  h.set("d", 0);
  h.set("e", 0);

  test.equal(h.size(), 5);
  test.equal(h.maxElementId(), "b");
  test.equal(h.get("b"), 233);

  h.remove("b");
  test.equal(h.size(), 4);
  test.equal(h.maxElementId(), "a");
  h.set("e", 44);
  test.equal(h.maxElementId(), "e");
  test.equal(h.get("b"), null);
  test.isTrue(h.has("a"));
  test.isFalse(h.has("dd"));

  h.clear();
  test.isFalse(h.has("a"));
  test.equal(h.size(), 0);
  test.equal(h.setDefault("a", 12345), 12345);
  test.equal(h.setDefault("a", 55555), 12345);
  test.equal(h.size(), 1);
  test.equal(h.maxElementId(), "a");
});

