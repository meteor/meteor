require("whatwg-fetch");

const rawFetch = global.fetch.bind(global);

function fetch(url, options) {
  const handler = Package['accounts-express']?.handleFetch;
  if (handler) {
    return handler(url, options, rawFetch);
  }
  return rawFetch(url, options);
}

exports.fetch = fetch;
exports.Headers = global.Headers;
exports.Request = global.Request;
exports.Response = global.Response;
