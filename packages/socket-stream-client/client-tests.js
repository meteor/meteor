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
        } else if (
          _.isEqual(history, [
            'connecting',
            'connected',
            'offline',
            'connecting',
            'connected',
            'offline',
          ])
        ) {
          // do nothing;
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
// _cleanup runs both when tearing down a live socket and at the top of every
// (re)connection attempt. Only the former is a disconnection: firing the
// 'disconnect' event when there was no socket sent consumers a phantom event
// once per retry cycle (and diverged from the node implementation).
testAsyncMulti('stream - cleanup without a socket does not fire disconnect', [
  function(test, expect) {
    var stream = new ClientStream('/');
    var disconnectCount = 0;
    stream.on('disconnect', function() {
      disconnectCount++;
    });

    var done = expect(function() {});
    stream.on(
      'reset',
      once(function() {
        // Connected: a real disconnect closes the socket and fires once.
        stream.disconnect();
        test.equal(disconnectCount, 1);

        // A cleanup with no socket must not fire a phantom event.
        stream._cleanup();
        test.equal(disconnectCount, 1);
        done();
      })
    );
  }
]);

// The window 'online' handler calls reconnect() on any non-offline stream,
// including permanently failed ones. reconnect() must be a true no-op there:
// it used to decrement retryCount (compensating for a _retryNow that then
// refused to run), drifting the counter negative on every online event.
Tinytest.add(
  'stream - reconnect on a permanently disconnected stream is a no-op',
  function(test) {
    var stream = new ClientStream('/');
    stream.disconnect({ _permanent: true });
    test.equal(stream.status().status, 'failed');

    var before = stream.status().retryCount;
    stream.reconnect();
    stream.reconnect();

    test.equal(stream.status().retryCount, before);
    test.equal(stream.status().status, 'failed');
  }
);

// The 100s legacy watchdog detects missing SockJS heartbeat frames. Native
// WebSocket transports have no such frames, so arming it there guarantees a
// healthy-but-quiet connection (DDP heartbeats disabled) is killed after
// 100s of silence.
Tinytest.add(
  'stream - legacy heartbeat watchdog only arms on the sockjs transport',
  function(test) {
    let stream = new ClientStream('/');
    try {
      // Simulate a message arriving on a native-WebSocket stream.
      stream._transport = 'websocket';
      stream._heartbeat_received();
      test.isFalse(!!stream.heartbeatTimer);

      // The sockjs transport keeps its watchdog.
      stream._transport = 'sockjs';
      stream._heartbeat_received();
      test.isTrue(!!stream.heartbeatTimer);
    } finally {
      stream.disconnect();
    }
  }
);
