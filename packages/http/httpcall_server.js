Meteor.http = Meteor.http || {};

var path = Npm.require('path');
var request = Npm.require('request');
var url_util = Npm.require('url');
var Future = Npm.require(path.join('fibers', 'future'));


Meteor.http.call = function(method, url, options, callback) {

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

  var new_url = Meteor.http._buildUrl(
    url_parts.protocol+"//"+url_parts.host+url_parts.pathname,
    url_parts.search, options.query, params_for_url);

  if (options.auth) {
    if (options.auth.indexOf(':') < 0)
      throw new Error('auth option should be of the form "username:password"');
    headers['Authorization'] = "Basic "+
      (new Buffer(options.auth, "ascii")).toString("base64");
  }

  if (params_for_body) {
    content = Meteor.http._encodeParams(params_for_body);
    headers['Content-Type'] = "application/x-www-form-urlencoded";
  }

  _.extend(headers, options.headers || {});

  ////////// Callback wrapping //////////

  var fut;
  if (! callback) {
    // Sync mode
    fut = new Future;
    callback = fut.resolver(); // throw errors, return results
  } else {
    // Async mode
    // re-enter user code in a Fiber
    callback = Meteor.bindEnvironment(callback, function(e) {
      Meteor._debug("Exception in callback of Meteor.http.call", e.stack);
    });
  }

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

      Meteor.http._populateData(response);

      if (response.statusCode >= 400)
        error = Meteor.http._makeErrorByStatus(response.statusCode, response.content);
    }

    callback(error, response);

  });

  // If we're in sync mode, block and return the result.
  if (fut)
    return fut.wait();
};
