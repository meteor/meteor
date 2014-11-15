Tinytest.add("stream - status", function (test) {
  // Very basic test. Just see that it runs and returns something. Not a
  // lot of coverage, but enough that it would have caught a recent bug.
  var status = Meteor.status();
  test.equal(typeof status, "object");
  test.isTrue(status.status);
  // Make sure backward-compatiblity names are defined.
  test.equal(status.retryCount, status.retryCount);
  test.equal(status.retryTime, status.retryTime);
});

testAsyncMulti("stream - reconnect", [
  function (test, expect) {
    var callback = _.once(expect(function() {
      var status;
      status = Meteor.status();
      test.equal(status.status, "connected");

      Meteor.reconnect();
      status = Meteor.status();
      test.equal(status.status, "connected");

      Meteor.reconnect({_force: true});
      status = Meteor.status();
      test.equal(status.status, "waiting");
    }));

    if (Meteor.status().status !== "connected")
      Meteor.connection._stream.on('reset', callback);
    else
      callback();
  }
]);

// Disconnecting and reconnecting transitions through the correct statuses.
testAsyncMulti("stream - basic disconnect", [
  function (test, expect) {
    var history = [];
    var stream = new LivedataTest.ClientStream("/");
    var onTestComplete = expect(function (unexpectedHistory) {
      stream.disconnect();
      if (unexpectedHistory) {
        test.fail("Unexpected status history: " +
                  JSON.stringify(unexpectedHistory));
      }
    });

    Tracker.autorun(function() {
      var status = stream.status();

      if (_.last(history) !== status.status) {
        history.push(status.status);

        if (_.isEqual(history, ["connecting"])) {
          // do nothing; wait for the next state
        } else if (_.isEqual(history, ["connecting", "connected"])) {
          stream.disconnect();
        } else if (_.isEqual(history, ["connecting", "connected", "offline"])) {
          stream.reconnect();
        } else if (_.isEqual(history, ["connecting", "connected", "offline",
                                       "connecting"])) {
          // do nothing; wait for the next state
        } else if (_.isEqual(history, ["connecting", "connected", "offline",
                                "connecting", "connected"])) {
          onTestComplete();
        } else {
          onTestComplete(history);
        }
      }
    });
  }
]);

// Remain offline if the online event is received while offline.
testAsyncMulti("stream - disconnect remains offline", [
  function (test, expect) {
    var history = [];
    var stream = new LivedataTest.ClientStream("/");
    var onTestComplete = expect(function (unexpectedHistory) {
      stream.disconnect();
      if (unexpectedHistory) {
        test.fail("Unexpected status history: " +
                  JSON.stringify(unexpectedHistory));
      }
    });

    Tracker.autorun(function() {
      var status = stream.status();

      if (_.last(history) !== status.status) {
        history.push(status.status);

        if (_.isEqual(history, ["connecting"])) {
          // do nothing; wait for the next status
        } else if (_.isEqual(history, ["connecting", "connected"])) {
          stream.disconnect();
        } else if (_.isEqual(history, ["connecting", "connected", "offline"])) {
          stream._online();
          test.isTrue(status.status === "offline");
          onTestComplete();
        } else {
          onTestComplete(history);
        }
      }
    });
  }
]);

Tinytest.add("stream - sockjs urls are computed correctly", function(test) {
  var testHasSockjsUrl = function(raw, expectedSockjsUrl) {
    var actual = LivedataTest.toSockjsUrl(raw);
    if (expectedSockjsUrl instanceof RegExp)
      test.isTrue(actual.match(expectedSockjsUrl), actual);
    else
      test.equal(actual, expectedSockjsUrl);
  };

  testHasSockjsUrl("http://subdomain.meteor.com/",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("http://subdomain.meteor.com",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("subdomain.meteor.com/",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("subdomain.meteor.com",
                   "http://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("/", Meteor._relativeToSiteRootUrl("/sockjs"));

  testHasSockjsUrl("http://localhost:3000/", "http://localhost:3000/sockjs");
  testHasSockjsUrl("http://localhost:3000", "http://localhost:3000/sockjs");
  testHasSockjsUrl("localhost:3000", "http://localhost:3000/sockjs");

  testHasSockjsUrl("https://subdomain.meteor.com/",
                   "https://subdomain.meteor.com/sockjs");
  testHasSockjsUrl("https://subdomain.meteor.com",
                   "https://subdomain.meteor.com/sockjs");

  testHasSockjsUrl("ddp+sockjs://ddp--****-foo.meteor.com/sockjs",
                   /^https:\/\/ddp--\d\d\d\d-foo\.meteor\.com\/sockjs$/);
  testHasSockjsUrl("ddpi+sockjs://ddp--****-foo.meteor.com/sockjs",
                   /^http:\/\/ddp--\d\d\d\d-foo\.meteor\.com\/sockjs$/);
});

testAsyncMulti("stream - /websocket is a websocket endpoint", [
  function(test, expect) {
    //
    // Verify that /websocket and /websocket/ don't return the main page
    //
    _.each(['/websocket', '/websocket/'], function(path) {
      HTTP.get(Meteor._relativeToSiteRootUrl(path), expect(function(error, result) {
        test.isNotNull(error);
        test.equal('Not a valid websocket request', result.content);
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
      test.equal(pageContent, result.content);
    });

    HTTP.get(Meteor.absoluteUrl('/'), expect(function(error, result) {
      test.isNull(error);
      pageContent = result.content;

      _.each(['/websockets', '/websockets/'], function(path) {
        HTTP.get(Meteor.absoluteUrl(path), wrappedCallback);
      });
    }));
  }
]);
