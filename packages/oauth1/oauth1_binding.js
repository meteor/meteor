import crypto from 'crypto';
import querystring from 'querystring';
import urlModule from 'url';

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
export class OAuth1Binding {
  constructor(config, urls) {
    this._config = config;
    this._urls = urls;
  }

  prepareRequestToken(callbackUrl) {
    const headers = this._buildHeader({
      oauth_callback: callbackUrl
    });

    const response = this._call('POST', this._urls.requestToken, headers);
    const tokens = querystring.parse(response.content);

    if (! tokens.oauth_callback_confirmed)
      throw Object.assign(new Error("oauth_callback_confirmed false when requesting oauth1 token"),
                               {response: response});

    this.requestToken = tokens.oauth_token;
    this.requestTokenSecret = tokens.oauth_token_secret;
  }

  prepareAccessToken(query, requestTokenSecret) {
    // support implementations that use request token secrets. This is
    // read by this._call.
    //
    // XXX make it a param to call, not something stashed on self? It's
    // kinda confusing right now, everything except this is passed as
    // arguments, but this is stored.
    if (requestTokenSecret)
      this.accessTokenSecret = requestTokenSecret;

    const headers = this._buildHeader({
      oauth_token: query.oauth_token,
      oauth_verifier: query.oauth_verifier
    });

    const response = this._call('POST', this._urls.accessToken, headers);
    const tokens = querystring.parse(response.content);

    if (! tokens.oauth_token || ! tokens.oauth_token_secret) {
      const error = new Error("missing oauth token or secret");
      // We provide response only if no token is available, we do not want to leak any tokens
      if (! tokens.oauth_token && ! tokens.oauth_token_secret) {
        Object.assign(error, {response: response});
      }
      throw error;
    }

    this.accessToken = tokens.oauth_token;
    this.accessTokenSecret = tokens.oauth_token_secret;
  }

  call(method, url, params, callback) {
    const headers = this._buildHeader({
      oauth_token: this.accessToken
    });

    if(! params) {
      params = {};
    }

    return this._call(method, url, headers, params, callback);
  }

  get(url, params, callback) {
    return this.call('GET', url, params, callback);
  }

  post(url, params, callback) {
    return this.call('POST', url, params, callback);
  }

  _buildHeader(headers) {
    return {
      oauth_consumer_key: this._config.consumerKey,
      oauth_nonce: Random.secret().replace(/\W/g, ''),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: (new Date().valueOf()/1000).toFixed().toString(),
      oauth_version: '1.0',
      ...headers,
    }
  }

  _getSignature(method, url, rawHeaders, accessTokenSecret, params) {
    const headers = this._encodeHeader({ ...rawHeaders, ...params });

    const parameters = Object.keys(headers).map(key => `${key}=${headers[key]}`)
      .sort().join('&');

    const signatureBase = [
      method,
      this._encodeString(url),
      this._encodeString(parameters)
    ].join('&');

    const secret = OAuth.openSecret(this._config.secret);

    let signingKey = `${this._encodeString(secret)}&`;
    if (accessTokenSecret)
      signingKey += this._encodeString(accessTokenSecret);

    return crypto.createHmac('SHA1', signingKey).update(signatureBase).digest('base64');
  };

  _call(method, url, headers = {}, params = {}, callback) {
    // all URLs to be functions to support parameters/customization
    if(typeof url === "function") {
      url = url(this);
    }

    // Extract all query string parameters from the provided URL
    const parsedUrl = urlModule.parse(url, true);
    // Merge them in a way that params given to the method call have precedence
    params = { ...parsedUrl.query, ...params };

    // Reconstruct the URL back without any query string parameters
    // (they are now in params)
    parsedUrl.query = {};
    parsedUrl.search = '';
    url = urlModule.format(parsedUrl);

    // Get the signature
    headers.oauth_signature =
      this._getSignature(method, url, headers, this.accessTokenSecret, params);

    // Make a authorization string according to oauth1 spec
    const authString = this._getAuthHeaderString(headers);

    // Make signed request
    try {
      const response = HTTP.call(method, url, {
        params,
        headers: {
          Authorization: authString
        }
      }, callback && ((error, response) => {
        if (! error) {
          response.nonce = headers.oauth_nonce;
        }
        callback(error, response);
      }));
      // We store nonce so that JWTs can be validated
      if (response)
        response.nonce = headers.oauth_nonce;
      return response;
    } catch (err) {
      throw Object.assign(new Error(`Failed to send OAuth1 request to ${url}. ${err.message}`),
                     {response: err.response});
    }
  };

  _encodeHeader(header) {
    return Object.keys(header).reduce((memo, key) => {
      memo[this._encodeString(key)] = this._encodeString(header[key]);
      return memo;
    }, {});
  };

  _encodeString(str) {
    return encodeURIComponent(str).replace(/[!'()]/g, escape).replace(/\*/g, "%2A");
  };

  _getAuthHeaderString(headers) {
    return 'OAuth ' +  Object.keys(headers).map(key =>
      `${this._encodeString(key)}="${this._encodeString(headers[key])}"`
    ).sort().join(', ');
  };

};
