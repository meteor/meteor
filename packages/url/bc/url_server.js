var common = require("./url_common.js");
var { URL } = Npm.require('url');

exports._constructUrl = function (urlString, query, params) {
  var url_parts = new URL(urlString);
  return common.buildUrl(
    url_parts.protocol + "//" + url_parts.host + url_parts.pathname,
    url_parts.search,
    query,
    params
  );
};

exports._encodeParams = common._encodeParams;