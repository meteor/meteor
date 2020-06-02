import { Tinytest } from "meteor/tinytest";

Tinytest.add("url - sanity", function (test) {
  test.equal(typeof URL, "function");
  test.equal(typeof URLSearchParams, "function");
});

// backwards compatability
require('../bc/url_tests');
