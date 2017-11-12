import { Tinytest } from "meteor/tinytest";

Tinytest.add('sockjs-shim - sanity', function (test) {
  test.equal(typeof SockJS, "function");
});
