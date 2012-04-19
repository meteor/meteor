
Meteor.http = Meteor.http || {};

(function() {

  Meteor.http._encodeParams = function(params) {
    var buf = [];
    _.each(params, function(value, key) {
      if (buf.length)
        buf.push('&');
      buf.push(encodeURIComponent(key), '=', encodeURIComponent(value));
    });
    return buf.join('').replace(/%20/g, '+');
  };

  Meteor.http._buildUrl = function(before_qmark, from_qmark, opt_query, opt_params) {
    var url_without_query = before_qmark;
    var query = from_qmark ? from_qmark.slice(1) : null;

    if (typeof opt_query === "string")
      query = String(opt_query);

    if (opt_params) {
      query = query || "";
      var prms = Meteor.http._encodeParams(opt_params);
      if (query && prms)
        query += '&';
      query += prms;
    }

    var url = url_without_query;
    if (query !== null)
      url += ("?"+query);

    return url;
  };

})();