(function () {
  Accounts.foursquare.setSecret = function (secret) {
    Accounts.foursquare._secret = secret;
  };

Accounts.addAutopublishFields({
  // not sure whether the github api can be used from the browser,
  // thus not sure if we should be sending access tokens; but we do it
  // for all other oauth2 providers, and it may come in handy.
  forLoggedInUser: ['services.foursquare'],
  forOtherUsers: ['services.foursquare.email']
});



  Accounts.oauth.registerService('foursquare', 2, function(query) {

    var accessToken = getAccessToken(query);
    var identity = getIdentity(accessToken);
    
    return {
      serviceData: {
        id: identity.id,
        accessToken: accessToken,
				email: identity.contact.email,
        phone: identity.contact.phone
      },
      options: {profile: {firstName: identity.firstName, 
                           lastName: identity.lastName, 
                             gender: identity.gender, 
                           homeCity: identity.homeCity, 
                           photoUrl: identity.photo}}
    };
  });

  var getAccessToken = function (query) {
	  var config = Accounts.loginServiceConfiguration.findOne({service: 'foursquare'});
	  if (!config)
		  throw new Accounts.ConfigError("Service not configured");
	  var result = Meteor.http.post(
			  "https://foursquare.com/oauth2/access_token", {headers: {Accept: 'application/json'}, params: {
				  client_id: config.clientId,
				  client_secret: config.secret,
          grant_type: "authorization_code",
				  redirect_uri: Meteor.absoluteUrl("_oauth/foursquare?close"),
				  code: query.code,
				  state: query.state

    }});
		if (result.error) 
      {
			throw result.error;
      }
		if (result.data.error)
      {
				throw result.data;
      }
	  return result.data.access_token;

  };

  var getIdentity = function (accessToken) {
    var result = Meteor.http.get(
      "https://api.foursquare.com/v2/users/self",
      {params: {oauth_token: accessToken}});


    if (result.error)
      throw result.error;
    return result.data.response.user;

  };
}) ();
