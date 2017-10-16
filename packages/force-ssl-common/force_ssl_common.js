import forwarded from 'forwarded-http';

// Determine if the connection is only over localhost. Both we
// received it on localhost, and all proxies involved received on
// localhost (supports "forwarded" and "x-forwarded-for").
const isLocalConnection = (req) => {
  const localhostRegexp = /^\s*(.*127\.0\.0\.1|\[?::1\]?)\s*$/;
  const request = Object.create(req);
  request.connection = Object.assign(
    {},
    req.connection,
    { remoteAddress: req.connection.remoteAddress || req.socket.remoteAddress }
  );
  const forwardedParams = forwarded(request);
  let isLocal = true;
  Object.keys(forwardedParams.for).forEach((forKey) => {
    if (!localhostRegexp.test(forKey)) {
      isLocal = false;
    }
  });
  return isLocal;
};

// Determine if the connection was over SSL at any point. Either we
// received it as SSL, or a proxy did and translated it for us.
const isSslConnection = (req) => {
  const forwardedParams = forwarded(req);
  return req.connection.pair
      || forwardedParams.proto && forwardedParams.proto.indexOf('https') !== -1;
};

export { isLocalConnection, isSslConnection };
