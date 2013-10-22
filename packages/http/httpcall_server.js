var path = Npm.require('path');
var request = Npm.require('request');
var url_util = Npm.require('url');

// _call always runs asynchronously; HTTP.call, defined below,
// wraps _call and runs synchronously when no callback is provided.
var _call = function(method, url, options, callback) {

  ////////// Process arguments //////////

  if (! callback && typeof options === "function") {
    // support (method, url, callback) argument list
    callback = options;
    options = null;
  }

  options = options || {};

  method = (method || "").toUpperCase();

  if (! /^https?:\/\//.test(url))
    throw new Error("url must be absolute and start with http:// or https://");

  var url_parts = url_util.parse(url);

  var headers = {};

  var content = options.content;
  if (options.data) {
    content = JSON.stringify(options.data);
    headers['Content-Type'] = 'application/json';
  }


  var params_for_url, params_for_body;
  if (content || method === "GET" || method === "HEAD")
    params_for_url = options.params;
  else
    params_for_body = options.params;

  var new_url = buildUrl(
    url_parts.protocol + "//" + url_parts.host + url_parts.pathname,
    url_parts.search, options.query, params_for_url);

  if (options.auth) {
    if (options.auth.indexOf(':') < 0)
      throw new Error('auth option should be of the form "username:password"');
    headers['Authorization'] = "Basic "+
      (new Buffer(options.auth, "ascii")).toString("base64");
  }

  if (params_for_body) {
    content = encodeParams(params_for_body);
    headers['Content-Type'] = "application/x-www-form-urlencoded";
  }

  _.extend(headers, options.headers || {});

  // wrap callback to add a 'response' property on an error, in case
  // we have both (http 4xx/5xx error, which has a response payload)
  callback = (function(callback) {
    return function(error, response) {
      if (error && response)
        error.response = response;
      callback(error, response);
    };
  })(callback);

  // safety belt: only call the callback once.
  callback = _.once(callback);


  ////////// Kickoff! //////////

  var req_options = {
    url: new_url,
    method: method,
    encoding: "utf8",
    jar: false,
    timeout: options.timeout,
    body: content,
    followRedirect: options.followRedirects,
    headers: headers
  };

  request(req_options, function(error, res, body) {
    var response = null;

    if (! error) {

      response = {};
      response.statusCode = res.statusCode;
      response.content = body;
      response.headers = res.headers;

      populateData(response);

      if (response.statusCode >= 400)
        error = makeErrorByStatus(response.statusCode, response.content);
    }

    callback(error, response);

  });
};

HTTP.call = Meteor._wrapAsync(_call);
