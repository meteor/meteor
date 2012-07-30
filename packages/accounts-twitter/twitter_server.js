(function () {

  Meteor.accounts.twitter.setSecret = function (secret) {
    Meteor.accounts.twitter._secret = secret;
  };

  Meteor.accounts.oauth1.registerService('twitter', function(oauth) {

    var identity = oauth.get('https://api.twitter.com/1/account/verify_credentials.json');

    return {
      options: {
        // XXX Figure out what to do here
        email: identity.screen_name + '@OAUTH1_TWITTER',
        // XXX Do we want to keep the accessTokenSecret also?
        services: {twitter: {id: identity.id, accessToken: oauth.accessToken}}
      },
      extra: {name: identity.name}
    };
  });
}) ();
