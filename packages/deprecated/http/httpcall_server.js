var path = require('path');
var request = require('request');
var url_util = require('url');
var URL = require("meteor/url").URL;
var common = require("./httpcall_common.js");
var HTTP = exports.HTTP = common.HTTP;
var hasOwn = Object.prototype.hasOwnProperty;

exports.HTTPInternals = {
  NpmModules: {
    request: {
      version: Npm.require('request/package.json').version,
      module: request
    }
  }
};

// _call always runs asynchronously; HTTP.call, defined below,
// wraps _call and runs synchronously when no callback is provided.
function _call(method, url, options, callback) {
  ////////// Process arguments //////////

  if (! callback && typeof options === "function") {
    // support (method, url, callback) argument list
    callback = options;
    options = null;
  }

  options = options || {};

  if (hasOwn.call(options, 'beforeSend')) {
    throw new Error("Option beforeSend not supported on server.");
  }

  method = (method || "").toUpperCase();

  if (! /^https?:\/\//.test(url))
    throw new Error("url must be absolute and start with http:// or https://");

  var headers = {};

  var content = options.content;
  if (options.data) {
    content = JSON.stringify(options.data);
    headers['Content-Type'] = 'application/json';
  }


  var paramsForUrl, paramsForBody;
  if (content || method === "GET" || method === "HEAD")
    paramsForUrl = options.params;
  else
    paramsForBody = options.params;

  var newUrl = URL._constructUrl(url, options.query, paramsForUrl);

  if (options.auth) {
    if (options.auth.indexOf(':') < 0)
      throw new Error('auth option should be of the form "username:password"');
    headers['Authorization'] = "Basic "+
      Buffer.from(options.auth, "ascii").toString("base64");
  }

  if (paramsForBody) {
    content = URL._encodeParams(paramsForBody);
    headers['Content-Type'] = "application/x-www-form-urlencoded";
  }

  if (options.headers) {
    Object.keys(options.headers).forEach(function (key) {
      headers[key] = options.headers[key];
    });
  }

  // wrap callback to add a 'response' property on an error, in case
  // we have both (http 4xx/5xx error, which has a response payload)
  callback = (function(callback) {
    var called = false;
    return function(error, response) {
      if (! called) {
        called = true;
        if (error && response) {
          error.response = response;
        }
        callback(error, response);
      }
    };
  })(callback);

  ////////// Kickoff! //////////

  // Allow users to override any request option with the npmRequestOptions
  // option.
  var reqOptions = Object.assign({
    url: newUrl,
    method: method,
    encoding: "utf8",
    jar: false,
    timeout: options.timeout,
    body: content,
    followRedirect: options.followRedirects,
    // Follow redirects on non-GET requests
    // also. (https://github.com/meteor/meteor/issues/2808)
    followAllRedirects: options.followRedirects,
    headers: headers
  }, options.npmRequestOptions || null);

  request(reqOptions, function(error, res, body) {
    var response = null;

    if (! error) {
      response = {};
      response.statusCode = res.statusCode;
      response.content = body;
      response.headers = res.headers;

      common.populateData(response);

      if (response.statusCode >= 400) {
        error = common.makeErrorByStatus(
          response.statusCode,
          response.content
        );
      }
    }

    callback(error, response);
  });
}

HTTP.call = Meteor.wrapAsync(_call);
