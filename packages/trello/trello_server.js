// https://api.trello.com/1/members/me
Trello.whitelistedFields = ['username', 'fullName', 'url', 'organizations', 'boards'];

Oauth.registerService('trello', 1, Trello._urls, function(oauthBinding) {
  var identity = oauthBinding.get('https://api.trello.com/1/members/me').data;

  var serviceData = {
    id: identity.id,
    screenName: identity.username,
    accessToken: oauthBinding.accessToken,
    accessTokenSecret: oauthBinding.accessTokenSecret
  };
  
  // include helpful fields from trello
  var fields = _.pick(identity, Trello.whitelistedFields);
  _.extend(serviceData, fields);

  return {
    serviceData: serviceData,
    options: {
      profile: {
        name: identity.fullName
      }
    }
  };
});


Trello.retrieveCredential = function(credentialToken) {
  return Oauth.retrieveCredential(credentialToken);
};