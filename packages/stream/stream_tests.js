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

