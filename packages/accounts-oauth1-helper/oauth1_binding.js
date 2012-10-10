var crypto = __meteor_bootstrap__.require("crypto");
var querystring = __meteor_bootstrap__.require("querystring");

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

OAuth1Binding.prototype.call = function(method, url) {
  var self = this;

  var headers = self._buildHeader({
    oauth_token: self.accessToken
  });

  var response = self._call(method, url, headers);
  return response.data;
};

OAuth1Binding.prototype.get = function(url) {
  return this.call('GET', url);
};

OAuth1Binding.prototype._buildHeader = function(headers) {
  var self = this;
  return _.extend({
    oauth_consumer_key: self._consumerKey,
    oauth_nonce: Meteor.uuid().replace(/\W/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: (new Date().valueOf()/1000).toFixed().toString(),
    oauth_version: '1.0'
  }, headers);
};

OAuth1Binding.prototype._getSignature = function(method, url, rawHeaders, accessTokenSecret) {
  var self = this;
  var headers = self._encodeHeader(rawHeaders);

  var parameters = _.map(headers, function(val, key) {
    return key + '=' + val;
  }).sort().join('&');

  var signatureBase = [
    method,
    encodeURIComponent(url),
    encodeURIComponent(parameters)
  ].join('&');

  var signingKey = encodeURIComponent(self._secret) + '&';
  if (accessTokenSecret)
    signingKey += encodeURIComponent(accessTokenSecret);

  return crypto.createHmac('SHA1', signingKey).update(signatureBase).digest('base64');
};

OAuth1Binding.prototype._call = function(method, url, headers, params) {
  var self = this;

  // Get the signature
  headers.oauth_signature = self._getSignature(method, url, headers, self.accessTokenSecret);

  // Make a authorization string according to oauth1 spec
  var authString = self._getAuthHeaderString(headers);

  // Make signed request
  var response = Meteor.http.call(method, url, {
    params: params,
    headers: {
      Authorization: authString
    }
  });

  if (response.error) {
    Meteor._debug('Error sending OAuth1 HTTP call', response.content, method, url, params, authString);
    throw response.error;
  }

  return response;
};

OAuth1Binding.prototype._encodeHeader = function(header) {
  return _.reduce(header, function(memo, val, key) {
    memo[encodeURIComponent(key)] = encodeURIComponent(val);
    return memo;
  }, {});
};

OAuth1Binding.prototype._getAuthHeaderString = function(headers) {
  return 'OAuth ' +  _.map(headers, function(val, key) {
    return encodeURIComponent(key) + '="' + encodeURIComponent(val) + '"';
  }).sort().join(', ');
};
