(function () {

  Meteor.accounts.twitter.setSecret = function (secret) {
    Meteor.accounts.twitter._secret = secret;
  };

  Meteor.accounts.oauth.registerService('twitter', {version: 1}, function(oauth) {

    var identity = oauth.get('https://api.twitter.com/1/account/verify_credentials.json');

    return {
      options: {
        services: {
          twitter: {
            id: identity.id,
            screenName: identity.screen_name,
            accessToken: oauth.accessToken
          }
        }
      },
      extra: {
        name: identity.name
      }
    };
  });
}) ();
