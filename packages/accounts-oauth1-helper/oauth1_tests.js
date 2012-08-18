Tinytest.add("oauth1 - loginResultForState is stored", function (test) {
  var http = __meteor_bootstrap__.require('http');
  var email = Meteor.uuid() + "@example.com";

  Meteor.accounts._loginTokens.remove({});
  Meteor.accounts.oauth._loginResultForState = {};
  Meteor.accounts.oauth._services = {};

  // register a fake login service - foobook
  Meteor.accounts.oauth.registerService("foobook", 1, function (query) {
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
  Meteor.accounts.oauth._middleware(req, new http.ServerResponse(req));

  // verify that a user is created
  var user = Meteor.users.findOne({emails: email});
  test.notEqual(user, undefined);
  test.equal(user.services.foobook.id, 1);

  // and that that user has a login token
  var token = Meteor.accounts._loginTokens.findOne({userId: user._id});
  test.notEqual(token, undefined);

  // and that the login result for that user is prepared
  test.equal(
    Meteor.accounts.oauth._loginResultForState['STATE'].id, user._id);
  test.equal(
    Meteor.accounts.oauth._loginResultForState['STATE'].token, token._id);
});
