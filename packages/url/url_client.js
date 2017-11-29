var common = require("./url_common.js");
var URL = exports.URL = common.URL;

URL._constructUrl = function (url, query, params) {
  var query_match = /^(.*?)(\?.*)?$/.exec(url);
  return common.buildUrl(
    query_match[1],
    query_match[2],
    query,
    params
  );
};
