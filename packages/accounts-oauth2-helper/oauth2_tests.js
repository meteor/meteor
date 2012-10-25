Tinytest.add("oauth2 - loginResultForState is stored", function (test) {
  var http = __meteor_bootstrap__.require('http');
  var foobookId = Meteor.uuid();
  var state = Meteor.uuid();

  if (!Accounts.loginServiceConfiguration.findOne({service: 'foobook'}))
    Accounts.loginServiceConfiguration.insert({service: 'foobook'});
  Accounts.foobook = {};

  try {
    // register a fake login service - foobook
    Accounts.oauth.registerService("foobook", 2, function (query) {
      return {serviceData: {id: foobookId}};
    });

    // simulate logging in using foobook
    var req = {method: "POST",
               url: "/_oauth/foobook?close",
               query: {state: state}};
    Accounts.oauth._middleware(req, new http.ServerResponse(req));

    // verify that a user is created
    var user = Meteor.users.findOne({"services.foobook.id": foobookId});
    test.notEqual(user, undefined);
    test.equal(user.services.foobook.id, foobookId);

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
    delete Accounts.oauth._services.foobook;
  }
});


Tinytest.add("oauth2 - error in user creation", function (test) {
  var http = __meteor_bootstrap__.require('http');
  var state = Meteor.uuid();
  var failbookId = Meteor.uuid();

  if (!Accounts.loginServiceConfiguration.findOne({service: 'failbook'}))
    Accounts.loginServiceConfiguration.insert({service: 'failbook'});
  Accounts.failbook = {};

  try {
    // register a failing login service
    Accounts.oauth.registerService("failbook", 2, function (query) {
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
               url: "/_oauth/failbook?close",
               query: {state: state}};
    Accounts.oauth._middleware(req, new http.ServerResponse(req));

    // verify that a user is not created
    var user = Meteor.users.findOne({"services.failbook.id": failbookId});
    test.equal(user, undefined);

    // verify an error is stored in login state
    test.equal(Accounts.oauth._loginResultForState[state].error, 403);

    // verify error is handed back to login method.
    test.throws(function () {
      Meteor.apply('login', [{oauth: {version: 2, state: state}}]);
    });
  } finally {
    delete Accounts.oauth._services.failbook;
  }
});


