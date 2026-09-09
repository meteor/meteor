import {
  getTransportFactory,
  resolveTransportName,
} from './index.js';
import { createTransportRegistry } from 'meteor/ddp-transport-registry';

Tinytest.add('ddp-server - transport selection priority is compatible', function (test) {
  test.equal(resolveTransportName({
    settings: { packages: { 'ddp-server': { transport: 'sockjs' } } },
    env: { DDP_TRANSPORT: 'uws', DISABLE_SOCKJS: '1' },
  }), 'sockjs');

  test.equal(resolveTransportName({
    settings: {},
    env: { DDP_TRANSPORT: 'uws', DISABLE_SOCKJS: '1' },
  }), 'uws');

  test.equal(resolveTransportName({
    settings: {},
    env: { DISABLE_SOCKJS: '1' },
  }), 'uws');

  test.equal(resolveTransportName({ settings: {}, env: {} }), 'sockjs');
});

Tinytest.add('ddp-server - omitted provider has an actionable error', function (test) {
  const registry = createTransportRegistry();
  registry.register('sockjs', function createSockJS() {});

  test.throws(
    () => getTransportFactory('uws', registry),
    /not included.*Included transports: sockjs.*--ddp-transport=uws.*--ddp-transport=both/
  );
});

Tinytest.add('ddp-server - unknown provider remains distinct', function (test) {
  test.throws(
    () => getTransportFactory('invalid', createTransportRegistry()),
    /Unknown DDP transport: "invalid".*Valid transports: sockjs, uws/
  );
});
