var MAX_LENGTH = 500; // if you change this, also change the appropriate test
var slice = Array.prototype.slice;

exports.makeErrorByStatus = function(statusCode, content) {
  var message = "failed [" + statusCode + "]";

  if (content) {
    var stringContent = typeof content == "string" ?
      content : content.toString();

    message += ' ' + truncate(stringContent.replace(/\n/g, ' '), MAX_LENGTH);
  }

  return new Error(message);
};

function truncate(str, length) {
  return str.length > length ? str.slice(0, length) + '...' : str;
}

// Fill in `response.data` if the content-type is JSON.
exports.populateData = function(response) {
  // Read Content-Type header, up to a ';' if there is one.
  // A typical header might be "application/json; charset=utf-8"
  // or just "application/json".
  var contentType = (response.headers['content-type'] || ';').split(';')[0];

  // Only try to parse data as JSON if server sets correct content type.
  if (['application/json',
       'text/javascript',
       'application/javascript',
       'application/x-javascript',
      ].indexOf(contentType) >= 0) {
    try {
      response.data = JSON.parse(response.content);
    } catch (err) {
      response.data = null;
    }
  } else {
    response.data = null;
  }
};

var HTTP = exports.HTTP = {};

/**
 * @summary Send an HTTP `GET` request. Equivalent to calling [`HTTP.call`](#http_call) with "GET" as the first argument.
 * @param {String} url The URL to which the request should be sent.
 * @param {Object} [callOptions] Options passed on to [`HTTP.call`](#http_call).
 * @param {Function} [asyncCallback] Callback that is called when the request is completed. Required on the client.
 * @locus Anywhere
 */
HTTP.get = function (/* varargs */) {
  return HTTP.call.apply(this, ["GET"].concat(slice.call(arguments)));
};

/**
 * @summary Send an HTTP `POST` request. Equivalent to calling [`HTTP.call`](#http_call) with "POST" as the first argument.
 * @param {String} url The URL to which the request should be sent.
 * @param {Object} [callOptions] Options passed on to [`HTTP.call`](#http_call).
 * @param {Function} [asyncCallback] Callback that is called when the request is completed. Required on the client.
 * @locus Anywhere
 */
HTTP.post = function (/* varargs */) {
  return HTTP.call.apply(this, ["POST"].concat(slice.call(arguments)));
};

/**
 * @summary Send an HTTP `PUT` request. Equivalent to calling [`HTTP.call`](#http_call) with "PUT" as the first argument.
 * @param {String} url The URL to which the request should be sent.
 * @param {Object} [callOptions] Options passed on to [`HTTP.call`](#http_call).
 * @param {Function} [asyncCallback] Callback that is called when the request is completed. Required on the client.
 * @locus Anywhere
 */
HTTP.put = function (/* varargs */) {
  return HTTP.call.apply(this, ["PUT"].concat(slice.call(arguments)));
};

/**
 * @summary Send an HTTP `DELETE` request. Equivalent to calling [`HTTP.call`](#http_call) with "DELETE" as the first argument. (Named `del` to avoid conflict with the Javascript keyword `delete`)
 * @param {String} url The URL to which the request should be sent.
 * @param {Object} [callOptions] Options passed on to [`HTTP.call`](#http_call).
 * @param {Function} [asyncCallback] Callback that is called when the request is completed. Required on the client.
 * @locus Anywhere
 */
HTTP.del = function (/* varargs */) {
  return HTTP.call.apply(this, ["DELETE"].concat(slice.call(arguments)));
};

/**
 * @summary Send an HTTP `PATCH` request. Equivalent to calling [`HTTP.call`](#http_call) with "PATCH" as the first argument.
 * @param {String} url The URL to which the request should be sent.
 * @param {Object} [callOptions] Options passed on to [`HTTP.call`](#http_call).
 * @param {Function} [asyncCallback] Callback that is called when the request is completed. Required on the client.
 * @locus Anywhere
 */
HTTP.patch = function (/* varargs */) {
  return HTTP.call.apply(this, ["PATCH"].concat(slice.call(arguments)));
};
