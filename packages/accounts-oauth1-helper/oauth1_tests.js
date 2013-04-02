
Tinytest.add("oauth1 - loginResultForState is stored", function (test) {
  var http = Npm.require('http');
  var twitterfooId = Random.id();
  var twitterfooName = 'nickname' + Random.id();
  var twitterfooAccessToken = Random.id();
  var twitterfooAccessTokenSecret = Random.id();
  var state = Random.id();
  var serviceName = Random.id();

  OAuth1Binding.prototype.prepareRequestToken = function() {};
  OAuth1Binding.prototype.prepareAccessToken = function() {
    this.accessToken = twitterfooAccessToken;
    this.accessTokenSecret = twitterfooAccessTokenSecret;
  };

  Accounts.loginServiceConfiguration.insert({service: serviceName});
  Accounts[serviceName] = {};

  try {
    // register a fake login service
    Accounts.oauth.registerService(serviceName, 1, function (query) {
      return {
        serviceData: {
          id: twitterfooId,
          screenName: twitterfooName,
          accessToken: twitterfooAccessToken,
          accessTokenSecret: twitterfooAccessTokenSecret
        }
      };
    });

    // simulate logging in using twitterfoo
    Accounts.oauth1._requestTokens[state] = twitterfooAccessToken;

    var req = {
      method: "POST",
      url: "/_oauth/" + serviceName + "?close",
      query: {
        state: state,
        oauth_token: twitterfooAccessToken
      }
    };
    Accounts.oauth._middleware(req, new http.ServerResponse(req));

    // verify that a user is created
    var selector = {};
    selector["services." + serviceName + ".screenName"] = twitterfooName;
    var user = Meteor.users.findOne(selector);
    test.notEqual(user, undefined);
    test.equal(user.services[serviceName].accessToken,
               twitterfooAccessToken);
    test.equal(user.services[serviceName].accessTokenSecret,
               twitterfooAccessTokenSecret);

    // and that that user has a login token
    test.equal(user.services.resume.loginTokens.length, 1);
    var token = user.services.resume.loginTokens[0].token;
    test.notEqual(token, undefined);

    // and that the login result for that user is prepared
    test.equal(
      Accounts.oauth._loginResultForState[state].id, user._id);
    test.equal(
      Accounts.oauth._loginResultForState[state].token, token);
  } finally {
    delete Accounts.oauth._services[serviceName];
  }
});


Tinytest.add("oauth1 - error in user creation", function (test) {
  var http = Npm.require('http');
  var state = Random.id();
  var twitterfailId = Random.id();
  var twitterfailName = 'nickname' + Random.id();
  var twitterfailAccessToken = Random.id();
  var twitterfailAccessTokenSecret = Random.id();
  var serviceName = Random.id();

  Accounts.loginServiceConfiguration.insert({service: serviceName});
  Accounts[serviceName] = {};

  // Wire up access token so that verification passes
  Accounts.oauth1._requestTokens[state] = twitterfailAccessToken;

  try {
    // register a failing login service
    Accounts.oauth.registerService(serviceName, 1, function (query) {
      return {
        serviceData: {
          id: twitterfailId,
          screenName: twitterfailName,
          accessToken: twitterfailAccessToken,
          accessTokenSecret: twitterfailAccessTokenSecret
        },
        options: {
          profile: {invalid: true}
        }
      };
    });

    // a way to fail new users. duplicated from passwords_tests, but
    // shouldn't hurt.
    Accounts.validateNewUser(function (user) {
      return !(user.profile && user.profile.invalid);
    });

    // simulate logging in with failure
    Meteor._suppress_log(1);
    var req = {
      method: "POST",
      url: "/_oauth/" + serviceName + "?close",
      query: {
        state: state,
        oauth_token: twitterfailAccessToken
      }
    };

    Accounts.oauth._middleware(req, new http.ServerResponse(req));

    // verify that a user is not created
    var selector = {};
    selector["services." + serviceName + ".screenName"] = twitterfailName;
    var user = Meteor.users.findOne(selector);
    test.equal(user, undefined);

    // verify an error is stored in login state
    test.equal(Accounts.oauth._loginResultForState[state].error, 403);

    // verify error is handed back to login method.
    test.throws(function () {
      Meteor.apply('login', [{oauth: {version: 1, state: state}}]);
    });
  } finally {
    delete Accounts.oauth._services[serviceName];
  }
});


