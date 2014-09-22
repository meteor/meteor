var crypto = Npm.require("crypto");
var querystring = Npm.require("querystring");
var urlModule = Npm.require("url");

// An OAuth1 wrapper around http calls which helps get tokens and
// takes care of HTTP headers
//
// @param config {Object}
//   - consumerKey (String): oauth consumer key
//   - secret (String): oauth consumer secret
// @param urls {Object}
//   - requestToken (String): url
//   - authorize (String): url
//   - accessToken (String): url
//   - authenticate (String): url
OAuth1Binding = function(config, urls) {
  this._config = config;
  this._urls = urls;
};

OAuth1Binding.prototype.prepareRequestToken = function(callbackUrl) {
  var self = this;

  var headers = self._buildHeader({
    oauth_callback: callbackUrl
  });

  var response = self._call('POST', self._urls.requestToken, headers);
  var tokens = querystring.parse(response.content);

  if (! tokens.oauth_callback_confirmed)
    throw _.extend(new Error("oauth_callback_confirmed false when requesting oauth1 token"),
                             {response: response});

  self.requestToken = tokens.oauth_token;
  self.requestTokenSecret = tokens.oauth_token_secret;
};

OAuth1Binding.prototype.prepareAccessToken = function(query, requestTokenSecret) {
  var self = this;

  // support implementations that use request token secrets. This is
  // read by self._call.
  //
  // XXX make it a param to call, not something stashed on self? It's
  // kinda confusing right now, everything except this is passed as
  // arguments, but this is stored.
  if (requestTokenSecret)
    self.accessTokenSecret = requestTokenSecret;

  var headers = self._buildHeader({
    oauth_token: query.oauth_token,
    oauth_verifier: query.oauth_verifier
  });

  var response = self._call('POST', self._urls.accessToken, headers);
  var tokens = querystring.parse(response.content);

  if (! tokens.oauth_token || ! tokens.oauth_token_secret) {
    var error = new Error("missing oauth token or secret");
    // We provide response only if no token is available, we do not want to leak any tokens
    if (! tokens.oauth_token && ! tokens.oauth_token_secret) {
      _.extend(error, {response: response});
    }
    throw error;
  }

  self.accessToken = tokens.oauth_token;
  self.accessTokenSecret = tokens.oauth_token_secret;
};

OAuth1Binding.prototype.call = function(method, url, params, callback) {
  var self = this;

  var headers = self._buildHeader({
    oauth_token: self.accessToken
  });

  if(! params) {
    params = {};
  }

  return self._call(method, url, headers, params, callback);
};

OAuth1Binding.prototype.get = function(url, params, callback) {
  return this.call('GET', url, params, callback);
};

OAuth1Binding.prototype.post = function(url, params, callback) {
  return this.call('POST', url, params, callback);
};

OAuth1Binding.prototype._buildHeader = function(headers) {
  var self = this;
  return _.extend({
    oauth_consumer_key: self._config.consumerKey,
    oauth_nonce: Random.secret().replace(/\W/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: (new Date().valueOf()/1000).toFixed().toString(),
    oauth_version: '1.0'
  }, headers);
};

OAuth1Binding.prototype._getSignature = function(method, url, rawHeaders, accessTokenSecret, params) {
  var self = this;
  var headers = self._encodeHeader(_.extend(rawHeaders, params));

  var parameters = _.map(headers, function(val, key) {
    return key + '=' + val;
  }).sort().join('&');

  var signatureBase = [
    method,
    self._encodeString(url),
    self._encodeString(parameters)
  ].join('&');

  var secret = OAuth.openSecret(self._config.secret);

  var signingKey = self._encodeString(secret) + '&';
  if (accessTokenSecret)
    signingKey += self._encodeString(accessTokenSecret);

  return crypto.createHmac('SHA1', signingKey).update(signatureBase).digest('base64');
};

OAuth1Binding.prototype._call = function(method, url, headers, params, callback) {
  var self = this;

  // all URLs to be functions to support parameters/customization
  if(typeof url === "function") {
    url = url(self);
  }

  headers = headers || {};
  params = params || {};

  // Extract all query string parameters from the provided URL
  var parsedUrl = urlModule.parse(url, true);
  // Merge them in a way that params given to the method call have precedence
  params = _.extend({}, parsedUrl.query, params);

  // Reconstruct the URL back without any query string parameters
  // (they are now in params)
  parsedUrl.query = {};
  parsedUrl.search = '';
  url = urlModule.format(parsedUrl);

  // Get the signature
  headers.oauth_signature =
    self._getSignature(method, url, headers, self.accessTokenSecret, params);

  // Make a authorization string according to oauth1 spec
  var authString = self._getAuthHeaderString(headers);

  // Make signed request
  try {
    var response = HTTP.call(method, url, {
      params: params,
      headers: {
        Authorization: authString
      }
    }, callback && function (error, response) {
      if (! error) {
        response.nonce = headers.oauth_nonce;
      }
      callback(error, response);
    });
    // We store nonce so that JWTs can be validated
    if (response)
      response.nonce = headers.oauth_nonce;
    return response;
  } catch (err) {
    throw _.extend(new Error("Failed to send OAuth1 request to " + url + ". " + err.message),
                   {response: err.response});
  }
};

OAuth1Binding.prototype._encodeHeader = function(header) {
  var self = this;
  return _.reduce(header, function(memo, val, key) {
    memo[self._encodeString(key)] = self._encodeString(val);
    return memo;
  }, {});
};

OAuth1Binding.prototype._encodeString = function(str) {
  return encodeURIComponent(str).replace(/[!'()]/g, escape).replace(/\*/g, "%2A");
};

OAuth1Binding.prototype._getAuthHeaderString = function(headers) {
  var self = this;
  return 'OAuth ' +  _.map(headers, function(val, key) {
    return self._encodeString(key) + '="' + self._encodeString(val) + '"';
  }).sort().join(', ');
};
