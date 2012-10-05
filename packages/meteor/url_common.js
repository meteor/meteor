(function () {

  Meteor.absoluteUrl = function (path, options) {
    // path is optional
    if (!options && typeof path === 'object') {
      options = path;
      path = undefined;
    }
    // merge options with defaults
    options = _.extend({}, Meteor.absoluteUrl.defaultOptions, options || {});

    var url = options.rootUrl;
    if (!url)
      throw new Error("Must pass options.rootUrl or set ROOT_URL in the server environment");

    if (!/\/$/.test(url)) // url ends with '/'
      url += '/';

    if (path)
      url += path;

    // turn http to http if secure option is set, and we're not talking
    // to localhost.
    if (options.secure &&
        /^http:/.test(url) && // url starts with 'http:'
        !/http:\/\/localhost[:\/]/.test(url) && // doesn't match localhost
        !/http:\/\/127\.0\.0\.1[:\/]/.test(url)) // or 127.0.0.1
      url = url.replace(/^http:/, 'https:');

    if (options.replaceLocalhost)
      url = url.replace(/^http:\/\/localhost([:\/].*)/, 'http://127.0.0.1$1');

    return url;
  };

  // allow later packages to override default options
  Meteor.absoluteUrl.defaultOptions = { };
  if (__meteor_runtime_config__ && __meteor_runtime_config__.ROOT_URL)
    Meteor.absoluteUrl.defaultOptions.rootUrl = __meteor_runtime_config__.ROOT_URL;

})();
