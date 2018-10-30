var URL = exports.URL = {};

function encodeString(str) {
  return encodeURIComponent(str).replace(/\*/g, '%2A');
}

// Encode URL parameters into a query string, handling nested objects and
// arrays properly.
URL._encodeParams = function (params, prefix) {
  var str = [];
  var isParamsArray = Array.isArray(params);
  for (var p in params) {
    if (Object.prototype.hasOwnProperty.call(params, p)) {
      var k = prefix ? prefix + '[' + (isParamsArray ? '' : p) + ']' : p;
      var v = params[p];
      if (typeof v === 'object') {
        str.push(this._encodeParams(v, k));
      } else {
        var encodedKey =
          encodeString(k).replace('%5B', '[').replace('%5D', ']');
        str.push(encodedKey + '=' + encodeString(v));
      }
    }
  }
  return str.join('&').replace(/%20/g, '+');
};

exports.buildUrl = function(before_qmark, from_qmark, opt_query, opt_params) {
  var url_without_query = before_qmark;
  var query = from_qmark ? from_qmark.slice(1) : null;

  if (typeof opt_query === "string")
    query = String(opt_query);

  if (opt_params) {
    query = query || "";
    var prms = URL._encodeParams(opt_params);
    if (query && prms)
      query += '&';
    query += prms;
  }

  var url = url_without_query;
  if (query !== null)
    url += ("?"+query);

  return url;
};
