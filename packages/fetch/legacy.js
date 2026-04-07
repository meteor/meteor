require("whatwg-fetch");

var rawFetch = global.fetch.bind(global);

function fetch(url, options) {
  var ae = Package['accounts-express'];
  if (ae && ae.handleFetch) {
    return ae.handleFetch(url, options, rawFetch);
  }
  return rawFetch(url, options);
}

exports.fetch = fetch;
exports.Headers = global.Headers;
exports.Request = global.Request;
exports.Response = global.Response;
