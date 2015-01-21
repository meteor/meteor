var url_util = Npm.require('url');

URL._constructUrl = function (url, query, params) {
  var url_parts = url_util.parse(url);
  return buildUrl(
    url_parts.protocol + "//" + url_parts.host + url_parts.pathname,
    url_parts.search, query, params);
};
