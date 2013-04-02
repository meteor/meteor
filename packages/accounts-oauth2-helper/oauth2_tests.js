Tinytest.add("oauth2 - loginResultForState is stored", function (test) {
  var http = Npm.require('http');
  var foobookId = Random.id();
  var state = Random.id();
  var serviceName = Random.id();

  Accounts.loginServiceConfiguration.insert({service: serviceName});
  Accounts[serviceName] = {};

  try {
    // register a fake login service
    Accounts.oauth.registerService(serviceName, 2, function (query) {
      return {serviceData: {id: foobookId}};
    });

    // simulate logging in using foobook
    var req = {method: "POST",
               url: "/_oauth/" + serviceName + "?close",
               query: {state: state}};
    Accounts.oauth._middleware(req, new http.ServerResponse(req));

    // verify that a user is created
    var selector = {};
    selector["services." + serviceName + ".id"] = foobookId;
    var user = Meteor.users.findOne(selector);
    test.notEqual(user, undefined);
    test.equal(user.services[serviceName].id, foobookId);

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
    Accounts.oauth._unregisterService(serviceName);
  }
});


Tinytest.add("oauth2 - error in user creation", function (test) {
  var http = Npm.require('http');
  var state = Random.id();
  var failbookId = Random.id();
  var serviceName = Random.id();

  Accounts.loginServiceConfiguration.insert({service: serviceName});
  Accounts[serviceName] = {};

  try {
    // register a failing login service
    Accounts.oauth.registerService(serviceName, 2, function (query) {
      return {
        serviceData: {
          id: failbookId
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
    var req = {method: "POST",
               url: "/_oauth/" + serviceName + "?close",
               query: {state: state}};
    Accounts.oauth._middleware(req, new http.ServerResponse(req));

    // verify that a user is not created
    var selector = {};
    selector["services." + serviceName + ".id"] = failbookId;
    var user = Meteor.users.findOne(selector);
    test.equal(user, undefined);

    // verify an error is stored in login state
    test.equal(Accounts.oauth._loginResultForState[state].error, 403);

    // verify error is handed back to login method.
    test.throws(function () {
      Meteor.apply('login', [{oauth: {version: 2, state: state}}]);
    });
  } finally {
    Accounts.oauth._unregisterService(serviceName);
  }
});


