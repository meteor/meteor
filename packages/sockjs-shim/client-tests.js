import { Tinytest } from "meteor/tinytest";

Tinytest.add('sockjs-shim - sanity', function (test) {
  const sockJsType = typeof SockJS;
  if (sockJsType === "undefined") {
    const wsType = typeof WebSocket;
    test.isTrue(
      wsType === "function" ||
      // Bizarrely, in PhantomJS 2, typeof WebSocket === "object".
      wsType === "object"
    );
    const WSp = WebSocket.prototype;
    test.equal(typeof WSp.send, "function");
    test.equal(typeof WSp.close, "function");
  } else {
    test.equal(sockJsType, "function");
  }
});
