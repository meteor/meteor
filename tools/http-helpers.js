///
/// utility functions for dealing with urls and http
///

var os = require('os');
var util = require('util');

var _ = require('underscore');
var request = require('request');
var Future = require('fibers/future');

var files = require('./files.js');


var httpHelpers = exports;
_.extend(exports, {

  // A wrapper around request that sets http proxy.
  request: function (urlOrOptions, callback) {

    if (!_.isObject(urlOrOptions))
      urlOrOptions = { url: urlOrOptions };

    var url = urlOrOptions.url;

    // try to get proxy from environment
    var proxy = process.env.HTTP_PROXY || process.env.http_proxy || null;
    // if we're going to an https url, try the https_proxy env variable first.
    if (/^https/i.test(url)) {
      proxy = process.env.HTTPS_PROXY || process.env.https_proxy || proxy;
    }
    if (proxy && !urlOrOptions.proxy) {
      urlOrOptions.proxy = proxy;
    }

    return request(urlOrOptions, callback);
  },



  // A synchronous wrapper around request(...) that returns the response "body"
  // or throws.
  getUrl: function (urlOrOptions, callback) {
    var future = new Future;
    // can't just use Future.wrap, because we want to return "body", not
    // "response".

    urlOrOptions = _.clone(urlOrOptions); // we are going to change it
    var appVersion;
    try {
      appVersion = files.getToolsVersion();
    } catch(e) {
      appVersion = 'checkout';
    }

    // meteorReleaseContext - an option with information about app directory
    // release versions, etc, is used to get exact Meteor version used.
    if (urlOrOptions.hasOwnProperty('meteorReleaseContext')) {
      // Get meteor app release version: if specified in command line args, take
      // releaseVersion, if not specified, try global meteor version
      var meteorReleaseContext = urlOrOptions.meteorReleaseContext;
      appVersion = meteorReleaseContext.releaseVersion;

      if (appVersion === 'none')
        appVersion = meteorReleaseContext.appReleaseVersion;
      if (appVersion === 'none')
        appVersion = 'checkout';

      delete urlOrOptions.meteorReleaseContext;
    }

    // Get some kind of User Agent: environment information.
    var ua = util.format('Meteor/%s OS/%s (%s; %s; %s;)',
              appVersion, os.platform(), os.type(), os.release(), os.arch());

    var headers = {'User-Agent': ua };

    if (_.isObject(urlOrOptions))
      urlOrOptions.headers = _.extend(headers, urlOrOptions.headers);
    else
      urlOrOptions = { url: urlOrOptions, headers: headers };

    httpHelpers.request(urlOrOptions, function (error, response, body) {
      if (error)
        future.throw(new files.OfflineError(error));
      else if (response.statusCode >= 400 && response.statusCode < 600)
        future.throw(response);
      else
        future.return(body);
    });
    return future.wait();
  }


});
