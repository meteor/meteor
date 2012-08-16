(function () {

  Meteor.absoluteUrl = function (path, options) {
    // merge options with defaults
    options = _.extend({}, Meteor.absoluteUrl.defaultOptions, options || {});

    var url = options.rootUrl;
    if (!url)
      throw new Error("Must pass options.rootUrl or set ROOT_URL in the server environment");

    if (!/\/$/.test(url)) // !endsWith(url, '/')
      url += '/';

    if (path)
      url += path;

    if (options.secure && /^http:/.test(url)) // startsWith(url, 'http:')
      url = url.replace(/^http:/, 'https:');

    return url;
  };

  // allow later packages to override default options
  Meteor.absoluteUrl.defaultOptions = { };
  if (__meteor_runtime_config__ && __meteor_runtime_config__.ROOT_URL)
    Meteor.absoluteUrl.defaultOptions.rootUrl = __meteor_runtime_config__.ROOT_URL;

})();
