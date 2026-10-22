import { Autoupdate } from 'meteor/autoupdate';

// The autoupdate version subscription must be skipped when DDP points at a
// different origin than the page, otherwise the server's version documents
// never match this page and it reloads forever.
Tinytest.add(
  'autoupdate - _isCrossOriginConnection detects a different DDP origin',
  function (test) {
    const original = __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
    try {
      delete __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
      test.isFalse(
        Autoupdate._isCrossOriginConnection(),
        'no configured DDP url is not cross-origin'
      );

      __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL =
        window.location.origin;
      test.isFalse(
        Autoupdate._isCrossOriginConnection(),
        'the page origin is not cross-origin'
      );

      __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL =
        'https://some-other-host.example.com:9999';
      test.isTrue(
        Autoupdate._isCrossOriginConnection(),
        'a different host/port is cross-origin'
      );
    } finally {
      if (original === undefined) {
        delete __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
      } else {
        __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL = original;
      }
    }
  }
);
