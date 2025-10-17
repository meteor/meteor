import { padded } from "./main.js";

Tinytest.add("padded", function (test) {
  test.equal(padded("a"), "____a");
});
