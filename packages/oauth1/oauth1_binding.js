var crypto = Npm.require("crypto");
var querystring = Npm.require("querystring");

// An OAuth1 wrapper around http calls which helps get tokens and
// takes care of HTTP headers
//
// @param consumerKey {String} As supplied by the OAuth1 provider
// @param consumerSecret {String} As supplied by the OAuth1 provider
// @param urls {Object}
//   - requestToken (String): url
//   - authorize (String): url
//   - accessToken (String): url
//   - authenticate (String): url
OAuth1Binding = function(consumerKey, consumerSecret, urls) {
  this._consumerKey = consumerKey;
  this._secret = consumerSecret;
  this._urls = urls;
};

OAuth1Binding.prototype.prepareRequestToken = function(callbackUrl) {
  var self = this;

  var headers = self._buildHeader({
    oauth_callback: callbackUrl
  });

  var response = self._call('POST', self._urls.requestToken, headers);
  var tokens = querystring.parse(response.content);

  // XXX should we also store oauth_token_secret here?
  if (!tokens.oauth_callback_confirmed)
    throw new Error("oauth_callback_confirmed false when requesting oauth1 token", tokens);
  self.requestToken = tokens.oauth_token;
};

OAuth1Binding.prototype.prepareAccessToken = function(query) {
  var self = this;

  var headers = self._buildHeader({
    oauth_token: query.oauth_token
  });

  var params = {
    oauth_verifier: query.oauth_verifier
  };

  var response = self._call('POST', self._urls.accessToken, headers, params);
  var tokens = querystring.parse(response.content);

  self.accessToken = tokens.oauth_token;
  self.accessTokenSecret = tokens.oauth_token_secret;
};

OAuth1Binding.prototype.call = function(method, url, params) {
  var self = this;

  var headers = self._buildHeader({
    oauth_token: self.accessToken
  });

  if(!params) {
    params = {};
  }

  var response = self._call(method, url, headers, params);
  return response;
};

OAuth1Binding.prototype.get = function(url, params) {
  return this.call('GET', url, params);
};

OAuth1Binding.prototype.post = function(url, params) {
  return this.call('POST', url, params);
};

OAuth1Binding.prototype._buildHeader = function(headers) {
  var self = this;
  return _.extend({
    oauth_consumer_key: self._consumerKey,
    oauth_nonce: Random.id().replace(/\W/g, ''),
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

  var signingKey = self._encodeString(self._secret) + '&';
  if (accessTokenSecret)
    signingKey += self._encodeString(accessTokenSecret);

  return crypto.createHmac('SHA1', signingKey).update(signatureBase).digest('base64');
};

OAuth1Binding.prototype._call = function(method, url, headers, params) {
  var self = this;

  // Get the signature
  headers.oauth_signature = self._getSignature(method, url, headers, self.accessTokenSecret, params);

  // Make a authorization string according to oauth1 spec
  var authString = self._getAuthHeaderString(headers);

  // Make signed request
  try {
    return Meteor.http.call(method, url, {
      params: params,
      headers: {
        Authorization: authString
      }
    });
  } catch (err) {
    throw new Error("Failed to send OAuth1 request to " + url + ". " + err.message);
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
