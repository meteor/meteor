// XXX SECTION: Meta tests

Tinytest.add("test-helpers - seeded_random", function (test) {
  // Test that two seeded PRNGs with the same seed produce the same values.
  const seed = "I'm a seed";
  const sr1 = new SeededRandom(seed);
  const sr2 = new SeededRandom(seed);
  const sr1vals = [];
  const sr2vals = [];
  for (let i = 0; i < 100; i++) {
    sr1vals.push(sr1.next());
    sr2vals.push(sr2.next());
  }
  test.equal(sr1vals, sr2vals);
});
