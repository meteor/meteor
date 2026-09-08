import { _calculateDDPUrl } from '../client/client_convenience.js';

Tinytest.add(
  'ddp-client - client convenience uses DDP_DEFAULT_CONNECTION_URL when configured',
  function(test) {
    const ddpUrl = _calculateDDPUrl({
      absoluteUrl: 'https://example.com/',
      runtimeConfig: {
        DDP_DEFAULT_CONNECTION_URL: 'https://example.net/'
      },
      browserHost: 'example.net',
      browserProtocol: 'https:',
    });

    test.equal(ddpUrl, 'https://example.net/');
  }
);

Tinytest.add(
  'ddp-client - client convenience fallback uses current browser host for mirror domains',
  function(test) {
    const ddpUrl = _calculateDDPUrl({
      absoluteUrl: 'https://example.com/',
      runtimeConfig: Object.create(null),
      browserHost: 'example.net',
      browserProtocol: 'https:',
    });

    test.equal(ddpUrl, 'https://example.net/');
  }
);

Tinytest.add(
  'ddp-client - client convenience fallback keeps app path prefix (subdirectory)',
  function(test) {
    const ddpUrl = _calculateDDPUrl({
      absoluteUrl: 'https://example.com/my-app/',
      runtimeConfig: {
        ROOT_URL_PATH_PREFIX: '/my-app'
      },
      browserHost: 'example.net',
      browserProtocol: 'https:',
    });

    test.equal(ddpUrl, 'https://example.net/my-app/');
  }
);

Tinytest.add(
  'ddp-client - client convenience fallback uses ROOT_URL_PATH_PREFIX when absoluteUrl is root',
  function(test) {
    const ddpUrl = _calculateDDPUrl({
      absoluteUrl: 'https://example.com/',
      runtimeConfig: {
        ROOT_URL_PATH_PREFIX: '/my-app'
      },
      browserHost: 'example.net',
      browserProtocol: 'https:',
    });

    test.equal(ddpUrl, 'https://example.net/my-app/');
  }
);

Tinytest.add(
  'ddp-client - client convenience fallback keeps browser host port',
  function(test) {
    const ddpUrl = _calculateDDPUrl({
      absoluteUrl: 'https://example.com/',
      runtimeConfig: Object.create(null),
      browserHost: 'example.net:3443',
      browserProtocol: 'https:',
    });

    test.equal(ddpUrl, 'https://example.net:3443/');
  }
);

// A page served over http can only reach a ws:// endpoint on its own host:
// deriving wss:// from ROOT_URL points at a port that terminates no TLS.
Tinytest.add(
  'ddp-client - client convenience fallback keeps the page protocol over ROOT_URL',
  function(test) {
    const ddpUrl = _calculateDDPUrl({
      absoluteUrl: 'https://example.com/',
      runtimeConfig: Object.create(null),
      browserHost: 'example.net',
      browserProtocol: 'http:',
    });

    test.equal(ddpUrl, 'http://example.net/');
  }
);

// ...and the reverse: an https page cannot open a ws:// socket (mixed content),
// so the page protocol wins in both directions.
Tinytest.add(
  'ddp-client - client convenience fallback keeps the page protocol when ROOT_URL is insecure',
  function(test) {
    const ddpUrl = _calculateDDPUrl({
      absoluteUrl: 'http://example.com/',
      runtimeConfig: Object.create(null),
      browserHost: 'example.net',
      browserProtocol: 'https:',
    });

    test.equal(ddpUrl, 'https://example.net/');
  }
);
