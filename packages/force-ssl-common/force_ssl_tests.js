import { isLocalConnection, isSslConnection } from './force_ssl_common';
import http from 'http';

Tinytest.add('force-ssl - check for a local connection', function (test) {
  const req = new http.IncomingMessage();
  req.connection = { remoteAddress: null };
  req.socket = { remoteAddress: null };

  // Remote address check (connection)

  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].forEach((ip) => {
    req.connection.remoteAddress = ip;
    test.isTrue(isLocalConnection(req), 'Is a local connection');
  });

  ['1.2.3.4', '2001:0db8:0000:0042:0000:8a2e:0370:7334'].forEach((ip) => {
    req.connection.remoteAddress = ip;
    test.isFalse(isLocalConnection(req), 'Not a local connection');
  });

  // Remote address check (socket)

  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].forEach((ip) => {
    req.connection = {};
    req.socket.remoteAddress = ip;
    test.isTrue(isLocalConnection(req), 'Is a local connection');
  });

  ['1.2.3.4', '2001:0db8:0000:0042:0000:8a2e:0370:7334'].forEach((ip) => {
    req.connection = {};
    req.socket.remoteAddress = ip;
    test.isFalse(isLocalConnection(req), 'Not a local connection');
  });

  // Header check

  const localHeaders = [
    {
      name: 'forwarded',
      value: 'for=127.0.0.1; proto=http',
      ip: '127.0.0.1',
    },
    {
      name: 'forwarded',
      value: 'for="[::1]"; proto=http',
      ip: '::1',
    },
    {
      name: 'x-forwarded-for',
      value: '127.0.0.1',
      ip: '127.0.0.1',
    },
  ];
  localHeaders.forEach((header) => {
    req.connection.remoteAddress = header.ip;
    req.headers[header.name] = header.value;
    test.isTrue(isLocalConnection(req), 'Is a local connection');
  });

  const remoteHeaders = [
    {
      name: 'forwarded',
      value: 'for=1.2.3.4; proto=http',
      ip: '1.2.3.4',
    },
    {
      name: 'forwarded',
      value: 'for=1.2.3.4; proto=http',
      ip: '127.0.0.1',
    },
    {
      name: 'forwarded',
      value: 'for="[2001:0db8:0000:0042:0000:8a2e:0370:7334]"; proto=http',
      ip: '2001:0db8:0000:0042:0000:8a2e:0370:7334',
    },
    {
      name: 'x-forwarded-for',
      value: '1.2.3.4',
      ip: '1.2.3.4',
    },
    {
      name: 'x-forwarded-for',
      value: '2001:0db8:0000:0042:0000:8a2e:0370:7334',
      ip: '2001:0db8:0000:0042:0000:8a2e:0370:7334',
    },
  ];
  remoteHeaders.forEach((header) => {
    req.connection.remoteAddress = header.ip;
    req.headers[header.name] = header.value;
    test.isFalse(isLocalConnection(req), 'Not a local connection');
  });
});

Tinytest.add('force-ssl - check for an SSL based connection', function (test) {
  const req = new http.IncomingMessage();

  req.connection = { pair: {} };
  test.isTrue(isSslConnection(req), 'Is an SSL based connection');

  req.connection = {};
  req.headers = { forwarded: 'for=127.0.0.1; proto=https' };
  test.isTrue(isSslConnection(req), 'Is an SSL based connection');

  req.headers = { 'x-forwarded-proto': 'https' };
  test.isTrue(isSslConnection(req), 'Is an SSL based connection');

  req.headers = { forwarded: 'for=127.0.0.1; proto=http' };
  test.isFalse(isSslConnection(req), 'Is not an SSL based connection');

  req.headers = { 'x-forwarded-proto': 'http' };
  test.isFalse(isSslConnection(req), 'Is not an SSL based connection');
});
