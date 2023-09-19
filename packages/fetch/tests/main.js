import { Tinytest } from "meteor/tinytest";

Tinytest.add("fetch - sanity", function (test) {
  test.equal(typeof fetch, "function");
});

Tinytest.addAsync("fetch - asset", function (test) {
  return fetch(
    Meteor.absoluteUrl("/packages/local-test_fetch/tests/asset.json", {
      replaceLocalhost: true, // https://docs.meteor.com/api/core.html#Meteor-absoluteUrl
    })
  )
    .then((res) => {
      if (!res.ok) throw res;
      return res.json();
    })
    .then((json) => {
      test.equal(json.word, "oyez");
      test.equal(json.times, 3);
    });
});
