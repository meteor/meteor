import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";
import { HTTP } from "meteor/http";
import { toSockjsUrl } from "./urls.js";
import { ClientStream } from "meteor/socket-stream-client";
import isEqual from "lodash.isequal";
import once from "lodash.once";

Tinytest.add('stream - status', function(test) {
  // Very basic test. Just see that it runs and returns something. Not a
  // lot of coverage, but enough that it would have caught a recent bug.
  var status = Meteor.status();
  test.equal(typeof status, 'object');
  test.isTrue(status.status);
});

testAsyncMulti('stream - reconnect', [
  function(test, expect) {
    var callback = once(
      expect(function() {
        var status;
        status = Meteor.status();
        test.equal(status.status, 'connected');

        Meteor.reconnect();
        status = Meteor.status();
        test.equal(status.status, 'connected');

        Meteor.reconnect({ _force: true });
        status = Meteor.status();
        test.equal(status.status, 'waiting');
      })
    );

    if (Meteor.status().status !== 'connected')
      Meteor.connection._stream.on('reset', callback);
    else callback();
  }
]);

// Disconnecting and reconnecting transitions through the correct statuses.
testAsyncMulti('stream - basic disconnect', [
  function(test, expect) {
    var history = [];
    var stream = new ClientStream('/');
    var onTestComplete = expect(function(unexpectedHistory) {
      stream.disconnect();
      if (unexpectedHistory) {
        test.fail(
          'Unexpected status history: ' + JSON.stringify(unexpectedHistory)
        );
      }
    });

    Tracker.autorun(function() {
      var status = stream.status();

      if (history[history.length -1] !== status.status) {
        history.push(status.status);

        if (isEqual(history, ['connecting'])) {
          // do nothing; wait for the next state
        } else if (isEqual(history, ['connecting', 'connected'])) {
          stream.disconnect();
        } else if (isEqual(history, ['connecting', 'connected', 'offline'])) {
          stream.reconnect();
        } else if (
          isEqual(history, [
            'connecting',
            'connected',
            'offline',
            'connecting'
          ])
        ) {
          // do nothing; wait for the next state
        } else if (
          isEqual(history, [
            'connecting',
            'connected',
            'offline',
            'connecting',
            'connected'
          ])
        ) {
          onTestComplete();
        } else {
          onTestComplete(history);
        }
      }
    });
  }
]);

// Remain offline if the online event is received while offline.
testAsyncMulti('stream - disconnect remains offline', [
  function(test, expect) {
    var history = [];
    var stream = new ClientStream('/');
    var onTestComplete = expect(function(unexpectedHistory) {
      stream.disconnect();
      if (unexpectedHistory) {
        test.fail(
          'Unexpected status history: ' + JSON.stringify(unexpectedHistory)
        );
      }
    });

    Tracker.autorun(function() {
      var status = stream.status();

      if (history[history.length - 1] !== status.status) {
        history.push(status.status);

        if (isEqual(history, ['connecting'])) {
          // do nothing; wait for the next status
        } else if (isEqual(history, ['connecting', 'connected'])) {
          stream.disconnect();
        } else if (isEqual(history, ['connecting', 'connected', 'offline'])) {
          stream._online();
          test.isTrue(status.status === 'offline');
          onTestComplete();
        } else {
          onTestComplete(history);
        }
      }
    });
  }
]);

Tinytest.add('stream - sockjs urls are computed correctly', function(test) {
  var testHasSockjsUrl = function(raw, expectedSockjsUrl) {
    var actual = toSockjsUrl(raw);
    if (expectedSockjsUrl instanceof RegExp)
      test.isTrue(actual.match(expectedSockjsUrl), actual);
    else test.equal(actual, expectedSockjsUrl);
  };

  testHasSockjsUrl(
    'http://subdomain.meteor.com/',
    'http://subdomain.meteor.com/sockjs'
  );
  testHasSockjsUrl(
    'http://subdomain.meteor.com',
    'http://subdomain.meteor.com/sockjs'
  );
  testHasSockjsUrl(
    'subdomain.meteor.com/',
    'http://subdomain.meteor.com/sockjs'
  );
  testHasSockjsUrl(
    'subdomain.meteor.com',
    'http://subdomain.meteor.com/sockjs'
  );
  testHasSockjsUrl('/', Meteor._relativeToSiteRootUrl('/sockjs'));

  testHasSockjsUrl('http://localhost:3000/', 'http://localhost:3000/sockjs');
  testHasSockjsUrl('http://localhost:3000', 'http://localhost:3000/sockjs');
  testHasSockjsUrl('localhost:3000', 'http://localhost:3000/sockjs');

  testHasSockjsUrl(
    'https://subdomain.meteor.com/',
    'https://subdomain.meteor.com/sockjs'
  );
  testHasSockjsUrl(
    'https://subdomain.meteor.com',
    'https://subdomain.meteor.com/sockjs'
  );

  testHasSockjsUrl(
    'ddp+sockjs://ddp--****-foo.meteor.com/sockjs',
    /^https:\/\/ddp--\d\d\d\d-foo\.meteor\.com\/sockjs$/
  );
  testHasSockjsUrl(
    'ddpi+sockjs://ddp--****-foo.meteor.com/sockjs',
    /^http:\/\/ddp--\d\d\d\d-foo\.meteor\.com\/sockjs$/
  );
});

testAsyncMulti('stream - /websocket is a websocket endpoint', [
  function(test, expect) {
    //
    // Verify that /websocket and /websocket/ don't return the main page
    //
    ['/websocket', '/websocket/'].forEach((path) => {
      HTTP.get(
        Meteor._relativeToSiteRootUrl(path),
        expect(function(error, result) {
          test.isNotNull(error);
          test.equal('Not a valid websocket request', result.content);
        })
      );
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

    HTTP.get(
      Meteor._relativeToSiteRootUrl('/'),
      expect(function(error, result) {
        test.isNull(error);
        pageContent = result.content;

        ['/websockets', '/websockets/'].forEach(function(path) {
          HTTP.get(Meteor._relativeToSiteRootUrl(path), wrappedCallback);
        });
      })
    );
  }
]);