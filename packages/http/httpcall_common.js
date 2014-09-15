makeErrorByStatus = function(statusCode, content) {
  var MAX_LENGTH = 500; // if you change this, also change the appropriate test

  var truncate = function(str, length) {
    return str.length > length ? str.slice(0, length) + '...' : str;
  };

  var message = "failed [" + statusCode + "]";
  if (content)
    message += " " + truncate(content.replace(/\n/g, " "), MAX_LENGTH);

  return new Error(message);
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

HTTP = {};

HTTP.get = function (/* varargs */) {
  return HTTP.call.apply(this, ["GET"].concat(_.toArray(arguments)));
};

HTTP.post = function (/* varargs */) {
  return HTTP.call.apply(this, ["POST"].concat(_.toArray(arguments)));
};

HTTP.put = function (/* varargs */) {
  return HTTP.call.apply(this, ["PUT"].concat(_.toArray(arguments)));
};

HTTP.del = function (/* varargs */) {
  return HTTP.call.apply(this, ["DELETE"].concat(_.toArray(arguments)));
};
