import { EventEmitter } from 'events';
import { createBunTransport } from './bun.js';
import { getTransport } from './index.js';

function makeServer() {
  const server = new EventEmitter();
  return server;
}

Tinytest.add(
  'ddp-server/bun - createBunTransport returns valid transport object',
  function (test) {
    const transport = createBunTransport();
    test.equal(transport.name, 'bun');
    test.isTrue(typeof transport.setup === 'function');
  }
);

Tinytest.add(
  'ddp-server/bun - transport setting honoured via Meteor.settings',
  function (test) {
    const savedSettings = Meteor.settings;
    try {
      Meteor.settings = {
        packages: { 'ddp-server': { transport: 'bun' } },
      };

      const seen = Meteor.settings?.packages?.['ddp-server'];
      test.isNotUndefined(seen, 'transport setting must be reachable via Meteor.settings');
      test.equal(seen.transport, 'bun',
        'transport name must round-trip through Meteor.settings.packages["ddp-server"].transport');

      const transport = getTransport();
      test.equal(transport.name, 'bun');
      test.equal(__meteor_runtime_config__.DDP_TRANSPORT, 'bun');
    } finally {
      Meteor.settings = savedSettings;
      delete __meteor_runtime_config__.DDP_TRANSPORT;
    }
  }
);

Tinytest.add(
  'ddp-server/bun - transport setting honoured via DDP_TRANSPORT env var',
  function (test) {
    const origEnv = process.env.DDP_TRANSPORT;
    const savedSettings = Meteor.settings;
    try {
      Meteor.settings = {};
      process.env.DDP_TRANSPORT = 'bun';

      const transport = getTransport();
      test.equal(transport.name, 'bun');
      test.equal(__meteor_runtime_config__.DDP_TRANSPORT, 'bun');
    } finally {
      if (origEnv !== undefined) {
        process.env.DDP_TRANSPORT = origEnv;
      } else {
        delete process.env.DDP_TRANSPORT;
      }
      Meteor.settings = savedSettings;
      delete __meteor_runtime_config__.DDP_TRANSPORT;
    }
  }
);

Tinytest.add(
  'ddp-server/bun - setup attaches upgrade listener to httpServer',
  function (test) {
    const transport = createBunTransport();
    const server = makeServer();
    const initialListeners = server.listenerCount('upgrade');

    const emitter = transport.setup(server, '');
    test.isTrue(emitter instanceof EventEmitter, 'setup must return an EventEmitter');
    test.equal(server.listenerCount('upgrade'), initialListeners + 1,
      'setup must register one upgrade listener on httpServer');
  }
);
