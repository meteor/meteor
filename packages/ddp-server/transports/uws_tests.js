const uws = Npm.require('uWebSockets.js');

// Pick a random high port to avoid clashing with anything else on the
// test box. The port doesn't matter; what we verify is the binding
// behaviour, not anything end-to-end over TCP.
function pickTestPort() {
  // Range 49152-65535 is the IANA-suggested ephemeral range.
  return 49152 + Math.floor(Math.random() * (65535 - 49152));
}

Tinytest.addAsync(
  'ddp-server/uws - LIBUS_LISTEN_EXCLUSIVE_PORT prevents SO_REUSEPORT collision',
  function (test, onComplete) {
    const port = pickTestPort();
    const host = '127.0.0.1';

    const app1 = uws.App();
    const app2 = uws.App();
    let token1 = null;
    let token2 = null;
    let waiting = 2;

    function maybeFinish() {
      if (--waiting > 0) return;

      test.isTrue(
        !!token1,
        'first listen with LIBUS_LISTEN_EXCLUSIVE_PORT should succeed'
      );
      test.isFalse(
        !!token2,
        'second listen on the SAME (host, port) with EXCLUSIVE_PORT ' +
        'should return a falsy token — kernel must reject the bind ' +
        'instead of silently sharing via SO_REUSEPORT'
      );

      // Best-effort cleanup. uws.us_listen_socket_close throws if the
      // token is falsy, which is why we guard it.
      try {
        if (token1) uws.us_listen_socket_close(token1);
      } catch (e) { /* ignore */ }
      try {
        if (token2) uws.us_listen_socket_close(token2);
      } catch (e) { /* ignore */ }

      onComplete();
    }

    app1.listen(host, port, uws.LIBUS_LISTEN_EXCLUSIVE_PORT, function (token) {
      token1 = token;
      // Only attempt the colliding listen after the first one settled,
      // so the result of app2 reflects the conflict and not a startup
      // race inside uws.
      app2.listen(host, port, uws.LIBUS_LISTEN_EXCLUSIVE_PORT, function (t) {
        token2 = t;
        maybeFinish();
      });
      maybeFinish();
    });
  }
);

Tinytest.addAsync(
  'ddp-server/uws - LIBUS_LISTEN_EXCLUSIVE_PORT enum exists and equals 1',
  function (test, onComplete) {

    test.equal(
      uws.LIBUS_LISTEN_EXCLUSIVE_PORT,
      1,
      'uws.LIBUS_LISTEN_EXCLUSIVE_PORT must be the integer flag 1; ' +
      'the listen-options bitmask in uWebSockets.js relies on this'
    );
    onComplete();
  }
);

Tinytest.add(
  'ddp-server/uws - settings read path goes through Meteor.settings',
  function (test) {
    const savedSettings = Meteor.settings;
    try {
      Meteor.settings = {
        packages: {
          'ddp-server': {
            uws: {
              port: 9999,
              host: '127.0.0.99',
              payloadLength: 99,
              timeout: 99,
            },
          },
        },
      };

      const seen = Meteor.settings?.packages?.['ddp-server']?.uws;
      test.isNotUndefined(
        seen,
        'Meteor.settings?.packages?.["ddp-server"]?.uws must be ' +
        'reachable via the optional-chain expression the transport uses'
      );
      test.equal(seen.port, 9999, 'uws.port must round-trip through Meteor.settings');
      test.equal(seen.host, '127.0.0.99', 'uws.host must round-trip through Meteor.settings');
      test.equal(seen.payloadLength, 99, 'uws.payloadLength must round-trip');
      test.equal(seen.timeout, 99, 'uws.timeout must round-trip');

      // And critically: the OLD read path must NOT see them — verifying
      // that populating Meteor.settings does not accidentally also
      // populate the client-side runtime-config object (which would
      // leak server settings to every browser session).
      const stale = (typeof __meteor_runtime_config__ === 'object' &&
        __meteor_runtime_config__ &&
        __meteor_runtime_config__.meteorSettings &&
        __meteor_runtime_config__.meteorSettings.packages &&
        __meteor_runtime_config__.meteorSettings.packages['ddp-server'] &&
        __meteor_runtime_config__.meteorSettings.packages['ddp-server'].uws);
      test.isUndefined(
        stale,
        '__meteor_runtime_config__.meteorSettings.packages["ddp-server"].uws ' +
        'must remain undefined on the server — populating it would leak ' +
        'private Meteor.settings into the client HTML via ' +
        'webapp_server.js encodeRuntimeConfig'
      );
    } finally {
      Meteor.settings = savedSettings;
    }
  }
);

Tinytest.add(
  'ddp-server/transport-selection - transport setting honoured via Meteor.settings',
  function (test) {
    const savedSettings = Meteor.settings;
    try {
      Meteor.settings = {
        packages: { 'ddp-server': { transport: 'uws' } },
      };

      const seen = Meteor.settings?.packages?.['ddp-server'];
      test.isNotUndefined(seen, 'transport setting must be reachable via Meteor.settings');
      test.equal(seen.transport, 'uws',
        'transport name must round-trip through ' +
        'Meteor.settings.packages["ddp-server"].transport');
    } finally {
      Meteor.settings = savedSettings;
    }
  }
);

// Why uws.js maps socket.close() onto socket.end().
//
// The socket contract in ./index.js requires close() to flush what send()
// queued, because livedata_server ends DDP version negotiation by sending
// 'failed' and closing in the same tick. uWS names its shutdowns the other
// way round: close() is the forceful one and drops the queued frame, end()
// is the graceful one and delivers it. This test pins that asymmetry down,
// so that a change in uWebSockets.js is caught here rather than through a
// silent negotiation failure.
function sendThenShutdown(shutdown, onResult) {
  const port = pickTestPort();
  const host = '127.0.0.1';
  const payload = JSON.stringify({ msg: 'failed', version: '1' });
  const app = uws.App();

  app.ws('/*', {
    open(socket) {
      socket.send(payload);
      socket[shutdown]();
    },
  });

  app.listen(host, port, uws.LIBUS_LISTEN_EXCLUSIVE_PORT, function (token) {
    if (!token) {
      onResult(null);
      return;
    }

    const received = [];
    let finished = false;
    const socket = new WebSocket('ws://' + host + ':' + port);

    function finish() {
      if (finished) return;
      finished = true;
      Meteor.clearTimeout(timer);
      try { socket.close(); } catch (e) { /* ignore */ }
      try { uws.us_listen_socket_close(token); } catch (e) { /* ignore */ }
      onResult(received);
    }

    const timer = Meteor.setTimeout(finish, 3000);
    socket.addEventListener('message', function (event) {
      received.push(String(event.data));
    });
    // Assert a tick after the close, so a frame still in flight is counted.
    socket.addEventListener('close', function () {
      Meteor.setTimeout(finish, 50);
    });
    socket.addEventListener('error', function () { /* asserted through the frames */ });
  });
}

Tinytest.addAsync(
  'ddp-server/uws - end() delivers a frame sent in the same tick, close() drops it',
  function (test, onComplete) {
    sendThenShutdown('end', function (afterEnd) {
      test.isNotNull(afterEnd, 'could not listen for the end() case');
      test.equal(
        afterEnd,
        [JSON.stringify({ msg: 'failed', version: '1' })],
        'end() must deliver the frame queued just before it'
      );

      sendThenShutdown('close', function (afterClose) {
        test.isNotNull(afterClose, 'could not listen for the close() case');
        test.equal(
          afterClose.length,
          0,
          'close() is expected to drop the queued frame; if this now passes, ' +
          'uWebSockets.js changed and the close()/end() adapter in uws.js ' +
          'should be revisited'
        );
        onComplete();
      });
    });
  }
);
