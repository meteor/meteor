Tinytest.add("oauth2 - loginResultForState is stored", function (test) {
  var http = __meteor_bootstrap__.require('http');

  Meteor.accounts._loginTokens.remove({});

  // register a fake login service - foobook
  Meteor.accounts.oauth2.registerService("foobook", function (query) {
    return {email: 'foo@bar.com', userData: {},
            serviceUserId: 1, serviceData: {}};
  });

  // simulate logging in using foobook
  var req = {method: "POST",
             url: "/_oauth/foobook?close",
             query: {state: "STATE"}};
  Meteor.accounts.oauth2._handleRequest(req, new http.ServerResponse(req));

  // verify that a user is created
  var user = Meteor.users.findOne({emails: 'foo@bar.com'});
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
