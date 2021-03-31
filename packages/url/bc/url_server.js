var url_util = require('url');
var common = require("./url_common.js");

exports._constructUrl = function (url, query, params) {
  var url_parts = url_util.parse(url);
  return common.buildUrl(
    url_parts.protocol + "//" + url_parts.host + url_parts.pathname,
    url_parts.search,
    query,
    params
  );
};

exports._encodeParams = common._encodeParams;