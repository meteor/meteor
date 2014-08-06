URL._constructUrl = function (url, query, params) {
  var query_match = /^(.*?)(\?.*)?$/.exec(url);
  return buildUrl(query_match[1], query_match[2], query, params);
};
