import { Tinytest } from "meteor/tinytest";

Tinytest.add("fetch - sanity", function (test) {
  test.equal(typeof fetch, "function");
});

Tinytest.addAsync("fetch - asset", async function (test) {
  const url = Meteor.absoluteUrl("/packages/local-test_fetch/tests/asset.json")
  const {
    word,
    times
  } = await fetch(url).then((res) => {
      if (!res.ok) throw res;
      return res.json();
    }).catch(console.error)
      test.equal(word, "oyez");
    test.equal(times, 3);
});
