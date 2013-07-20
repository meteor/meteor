makeErrorByStatus = function(statusCode, content) {
  var MAX_LENGTH = 160; // if you change this, also change the appropriate test

  var truncate = function(str, length) {
    return str.length > length ? str.slice(0, length) + '...' : str;
  };

  var message = "failed [" + statusCode + "]";
  if (content)
    message += " " + truncate(content.replace(/\n/g, " "), MAX_LENGTH);

  return new Error(message);
};

encodeParams = function(params) {
  var buf = [];
  _.each(params, function(value, key) {
    if (buf.length)
      buf.push('&');
    buf.push(encodeString(key), '=', encodeString(value));
  });
  return buf.join('').replace(/%20/g, '+');
};

encodeString = function(str) {
  return encodeURIComponent(str).replace(/[!'()]/g, escape).replace(/\*/g, "%2A");
};

buildUrl = function(before_qmark, from_qmark, opt_query, opt_params) {
  var url_without_query = before_qmark;
  var query = from_qmark ? from_qmark.slice(1) : null;

  if (typeof opt_query === "string")
    query = String(opt_query);

  if (opt_params) {
    query = query || "";
    var prms = encodeParams(opt_params);
    if (query && prms)
      query += '&';
    query += prms;
  }

  var url = url_without_query;
  if (query !== null)
    url += ("?"+query);

  return url;
};

// Fill in `response.data` if the content-type is JSON.
populateData = function(response) {
  // Read Content-Type header, up to a ';' if there is one.
  // A typical header might be "application/json; charset=utf-8"
  // or just "application/json".
  var contentType = (response.headers['content-type'] || ';').split(';')[0];

  // Only try to parse data as JSON if server sets correct content type.
  if (_.include(['application/json', 'text/javascript'], contentType)) {
    try {
      response.data = JSON.parse(response.content);
    } catch (err) {
      response.data = null;
    }
  } else {
    response.data = null;
  }
};

// @export Meteor.http.get
Meteor.http.get = function (/* varargs */) {
  return Meteor.http.call.apply(this, ["GET"].concat(_.toArray(arguments)));
};

// @export Meteor.http.post
Meteor.http.post = function (/* varargs */) {
  return Meteor.http.call.apply(this, ["POST"].concat(_.toArray(arguments)));
};

// @export Meteor.http.put
Meteor.http.put = function (/* varargs */) {
  return Meteor.http.call.apply(this, ["PUT"].concat(_.toArray(arguments)));
};

// @export Meteor.http.del
Meteor.http.del = function (/* varargs */) {
  return Meteor.http.call.apply(this, ["DELETE"].concat(_.toArray(arguments)));
};
