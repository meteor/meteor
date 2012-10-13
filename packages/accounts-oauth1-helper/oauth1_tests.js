
Tinytest.add("oauth1 - loginResultForState is stored", function (test) {
  var http = __meteor_bootstrap__.require('http');
  var twitterfooId = Meteor.uuid();
  var twitterfooName = 'nickname' + Meteor.uuid();
  var twitterfooAccessToken = Meteor.uuid();
  var twitterfooAccessTokenSecret = Meteor.uuid();
  var state = Meteor.uuid();

  OAuth1Binding.prototype.prepareRequestToken = function() {};
  OAuth1Binding.prototype.prepareAccessToken = function() {
    this.accessToken = twitterfooAccessToken;
    this.accessTokenSecret = twitterfooAccessTokenSecret;
  };

  if (!Accounts.loginServiceConfiguration.findOne({service: 'twitterfoo'}))
    Accounts.loginServiceConfiguration.insert({service: 'twitterfoo'});
  Accounts.twitterfoo = {};

  try {
    // register a fake login service - twitterfoo
    Accounts.oauth.registerService("twitterfoo", 1, function (query) {
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
      url: "/_oauth/twitterfoo?close",
      query: {
        state: state,
        oauth_token: twitterfooAccessToken
      }
    };
    Accounts.oauth._middleware(req, new http.ServerResponse(req));

    // verify that a user is created
    var user = Meteor.users.findOne(
      {"services.twitterfoo.screenName": twitterfooName});
    test.notEqual(user, undefined);
    test.equal(user.services.twitterfoo.accessToken,
               twitterfooAccessToken);
    test.equal(user.services.twitterfoo.accessTokenSecret,
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
    delete Accounts.oauth._services.twitterfoo;
  }
});


Tinytest.add("oauth1 - error in user creation", function (test) {
  var http = __meteor_bootstrap__.require('http');
  var state = Meteor.uuid();
  var twitterfailId = Meteor.uuid();
  var twitterfailName = 'nickname' + Meteor.uuid();
  var twitterfailAccessToken = Meteor.uuid();
  var twitterfailAccessTokenSecret = Meteor.uuid();

  if (!Accounts.loginServiceConfiguration.findOne({service: 'twitterfail'}))
    Accounts.loginServiceConfiguration.insert({service: 'twitterfail'});
  Accounts.twitterfail = {};

  // Wire up access token so that verification passes
  Accounts.oauth1._requestTokens[state] = twitterfailAccessToken;

  try {
    // register a failing login service
    Accounts.oauth.registerService("twitterfail", 1, function (query) {
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
      url: "/_oauth/twitterfail?close",
      query: {
        state: state,
        oauth_token: twitterfailAccessToken
      }
    };

    Accounts.oauth._middleware(req, new http.ServerResponse(req));

    // verify that a user is not created
    var user = Meteor.users.findOne({"services.twitter.screenName": twitterfailName});
    test.equal(user, undefined);

    // verify an error is stored in login state
    test.equal(Accounts.oauth._loginResultForState[state].error, 403);

    // verify error is handed back to login method.
    test.throws(function () {
      Meteor.apply('login', [{oauth: {version: 1, state: state}}]);
    });
  } finally {
    delete Accounts.oauth._services.twitterfail;
  }
});


