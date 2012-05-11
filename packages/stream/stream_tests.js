Tinytest.add("stream - status", function (test) {
  // Very basic test. Just see that it runs and returns something. Not a
  // lot of coverage, but enough that it would have caught a recent bug.
  var status = Meteor.status();
  test.equal(typeof status, "object");
  test.isTrue(status.status);
});

Tinytest.add("stream - sockjs urls are computed correctly", function(test) {
  var testHasSockjsUrl = function(raw, expectedSockjsUrl) {
    test.equal(Meteor._Stream._toSockjsUrl(raw), expectedSockjsUrl);
  };

  testHasSockjsUrl("http://subdomain.meteor.com/sockjs",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("http://subdomain.meteor.com/",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("http://subdomain.meteor.com",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("subdomain.meteor.com/sockjs",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("subdomain.meteor.com/",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("subdomain.meteor.com",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("/sockjs", "/sockjs");
  testHasSockjsUrl("/", "/sockjs");

  testHasSockjsUrl("http://localhost:3000/sockjs",
                   "http://localhost:3000/sockjs");
  testHasSockjsUrl("http://localhost:3000/", "http://localhost:3000/sockjs");
  testHasSockjsUrl("http://localhost:3000", "http://localhost:3000/sockjs");
  testHasSockjsUrl("localhost:3000", "http://localhost:3000/sockjs");

  testHasSockjsUrl("https://subdomain.meteor.com/sockjs",
                   "https://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("https://subdomain.meteor.com/",
                   "https://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("https://subdomain.meteor.com",
                   "https://subdomain.meteor.com/sockjs");
});

testAsyncMulti("stream - /websocket is a websocket endpoint", [
  function(test, expect) {
    //
    // Verify that /websocket and /websocket/ don't return the main page
    //
    _.each(['/websocket', '/websocket/'], function(path) {
      Meteor.http.get(path, expect(function(error, result) {
        test.isNotNull(error);
        test.equal(result.content, 'Can "Upgrade" only to "WebSocket".');
      }));
    });

    //
    // For sanity, also verify that /websockets and /websockets/ return
    // the main page
    //

    // Somewhat contorted but we can't call nested expects (XXX why?)
    var pageContent;
    var wrappedCallback = expect(function(error, result) {
      test.isNull(error);
      test.equal(result.content, pageContent);
    });

    Meteor.http.get('/', expect(function(error, result) {
      test.isNull(error);
      pageContent = result.content;

      _.each(['/websockets', '/websockets/'], function(path) {
        Meteor.http.get(path, wrappedCallback);
      });
    }));
  }
]);
