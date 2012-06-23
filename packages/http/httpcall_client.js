Meteor.http = Meteor.http || {};

(function() {

  Meteor.http.call = function(method, url, options, callback) {

    ////////// Process arguments //////////

    if (! callback && typeof options === "function") {
      // support (method, url, callback) argument list
      callback = options;
      options = null;
    }

    options = options || {};

    if (typeof callback !== "function")
      throw new Error(
        "Can't make a blocking HTTP call from the client; callback required.");

    method = (method || "").toUpperCase();

    var content = options.content;
    if (options.data)
      content = JSON.stringify(options.data);

    var params_for_url, params_for_body;
    if (content || method === "GET" || method === "HEAD")
      params_for_url = options.params;
    else
      params_for_body = options.params;

    var query_match = /^(.*?)(\?.*)?$/.exec(url);
    url = Meteor.http._buildUrl(query_match[1], query_match[2],
                                options.query, params_for_url);


    if (options.followRedirects === false)
      throw new Error("Option followRedirects:false not supported on client.");

    var username, password;
    if (options.auth) {
      var colonLoc = options.auth.indexOf(':');
      if (colonLoc < 0)
        throw new Error('auth option should be of the form "username:password"');
      username = options.auth.substring(0, colonLoc);
      password = options.auth.substring(colonLoc+1);
    }

    if (params_for_body) {
      content = Meteor.http._encodeParams(params_for_body);
    }

    ////////// Callback wrapping //////////

    // wrap callback to always return a result object, and always
    // have an 'error' property in result
    callback = (function(callback) {
      return function(error, result) {
        result = result || {};
        result.error = error;
        callback(error, result);
      };
    })(callback);

    // safety belt: only call the callback once.
    callback = _.once(callback);


    ////////// Kickoff! //////////

    // from this point on, errors are because of something remote, not
    // something we should check in advance. Turn exceptions into error
    // results.
    try {
      // setup XHR object
      var xhr;
      if (typeof XMLHttpRequest !== "undefined")
        xhr = new XMLHttpRequest();
      else if (typeof ActiveXObject !== "undefined")
        xhr = new ActiveXObject("Microsoft.XMLHttp"); // IE6
      else
        throw new Error("Can't create XMLHttpRequest"); // ???

      xhr.open(method, url, true, username, password);

      if (options.headers)
        for (var k in options.headers)
          xhr.setRequestHeader(k, options.headers[k]);


      // setup timeout
      var timed_out = false;
      var timer;
      if (options.timeout) {
        timer = Meteor.setTimeout(function() {
          timed_out = true;
          xhr.abort();
        }, options.timeout);
      };

      // callback on complete
      xhr.onreadystatechange = function(evt) {
        if (xhr.readyState === 4) { // COMPLETE
          if (timer)
            Meteor.clearTimeout(timer);

          if (timed_out) {
            callback(new Error("timeout"));
          } else if (! xhr.status) {
            // no HTTP response
            callback(new Error("network"));
          } else {

            var response = {};
            response.statusCode = xhr.status;
            response.content = xhr.responseText;

            response.headers = {};
            var header_str = xhr.getAllResponseHeaders();
            var headers_raw = header_str.split(/\r?\n/);
            _.each(headers_raw, function (h) {
              var m = /^(.*?):(?:\s+)(.*)$/.exec(h);
              if (m && m.length === 3)
                response.headers[m[1].toLowerCase()] = m[2];
            });

            Meteor.http._populateData(response);

            var error = null;
            if (xhr.status >= 400)
              error = new Error("failed");

            callback(error, response);
          }
        }
      };

      // send it on its way
      xhr.send(content);

    } catch (err) {
      callback(err);
    }

  };


})();

