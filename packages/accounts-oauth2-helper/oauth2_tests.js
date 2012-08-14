Tinytest.add("oauth2 - loginResultForState is stored", function (test) {
  var http = __meteor_bootstrap__.require('http');
  var email = Meteor.uuid() + "@example.com";

  // XXX XXX test isolation fail!
  Meteor.accounts._loginTokens.remove({});
  Meteor.accounts.oauth2._loginResultForState = {};
  Meteor.accounts.oauth2._services = {};

  // register a fake login service - foobook
  Meteor.accounts.oauth2.registerService("foobook", function (query) {
    return {
      options: {
        email: email,
        services: {foobook: {id: 1}}
      }
    };
  });

  // simulate logging in using foobook
  var req = {method: "POST",
             url: "/_oauth/foobook?close",
             query: {state: "STATE"}};
  Meteor.accounts.oauth2._handleRequest(req, new http.ServerResponse(req));

  // verify that a user is created
  var user = Meteor.users.findOne({emails: email});
  test.notEqual(user, undefined);
  test.equal(user.services.foobook.id, 1);

  // and that that user has a login token
  var token = Meteor.accounts._loginTokens.findOne({userId: user._id});
  test.notEqual(token, undefined);

  // and that the login result for that user is prepared
  test.equal(
    Meteor.accounts.oauth2._loginResultForState['STATE'].id, user._id);
  test.equal(
    Meteor.accounts.oauth2._loginResultForState['STATE'].token, token._id);
});


Tinytest.add("oauth2 - error in user creation", function (test) {
  var http = __meteor_bootstrap__.require('http');
  var email = Meteor.uuid() + "@example.com";
  var state = Meteor.uuid();

  // register a failing login service
  Meteor.accounts.oauth2.registerService("failbook", function (query) {
    return {
      options: {
        email: email,
        services: {foobook: {id: Meteor.uuid()}}
      },
      extra: {
        invalid: true
      }
    };
  });

  // a way to fail new users. duplicated from passwords_tests, but
  // shouldn't hurt.
  Meteor.accounts.validateNewUser(function (user) {
    return !user.invalid;
  });

  // simulate logging in with failure
  Meteor._suppress_log(1);
  var req = {method: "POST",
             url: "/_oauth/failbook?close",
             query: {state: state}};
  Meteor.accounts.oauth2._handleRequest(req, new http.ServerResponse(req));

  // verify that a user is not created
  var user = Meteor.users.findOne({emails: email});
  test.equal(user, undefined);

  // verify an error is stored in login state
  test.equal(Meteor.accounts.oauth2._loginResultForState[state].error, 403);

  // verify error is handed back to login method.
  test.throws(function () { 
    Meteor.apply('login', [{oauth: {version: 2, state: state}}]);
  });

});
