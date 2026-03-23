var common = require("./url_common.js");

exports._constructUrl = function (urlString, query, params) {
  var url_parts = new globalThis.URL(urlString);
  return common.buildUrl(
    url_parts.protocol + "//" + url_parts.host + url_parts.pathname,
    url_parts.search,
    query,
    params
  );
};

exports._encodeParams = common._encodeParams;