import { Tinytest } from "meteor/tinytest";

Tinytest.add('sockjs-shim - sanity', function (test) {
  const type = typeof SockJS;
  if (type === "undefined") {
    test.equal(typeof WebSocket, "function");
  } else {
    test.equal(type, "function");
  }
});
