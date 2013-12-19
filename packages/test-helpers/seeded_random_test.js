// XXX SECTION: Meta tests

Tinytest.add("seeded random", function (test) {
  // Test that two seeded PRNGs with the same seed produce the same values.
  var seed = "I'm a seed";
  var sr1 = new SeededRandom(seed);
  var sr2 = new SeededRandom(seed);
  var sr1vals = [];
  var sr2vals = [];
  for (var i = 0; i < 100; i++) {
    sr1vals.push(sr1.next());
    sr2vals.push(sr2.next());
  }
  test.equal(sr1vals, sr2vals);
});
