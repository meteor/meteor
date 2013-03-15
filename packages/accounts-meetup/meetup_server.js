(function () {
  Accounts.oauth.registerService('meetup', 2, function(query) {

    var accessToken = getAccessToken(query);
    var identity = getIdentity(accessToken);

    return {
      serviceData: {
        id: identity.id,
        accessToken: accessToken
      },
      options: {profile: {name: identity.name}}
    };
  });

  var getAccessToken = function (query) {
    var config = Accounts.loginServiceConfiguration.findOne({service: 'meetup'});
    if (!config)
      throw new Accounts.ConfigError("Service not configured");

    var result = Meteor.http.post(
      "https://secure.meetup.com/oauth2/access", {headers: {Accept: 'application/json'}, params: {
	code: query.code,
	client_id: config.clientId,
	client_secret: config.secret,
        grant_type: 'authorization_code',
	redirect_uri: Meteor.absoluteUrl("_oauth/meetup?close"),
	state: query.state
      }});
    if (result.error) // if the http response was an error
      throw result.error;
    if (result.data.error) // if the http response was a json object with an error attribute
      throw result.data;

    return result.data.access_token;
  };

  var getIdentity = function (accessToken) {
    var result = Meteor.http.get(
      "https://secure.meetup.com/2/members",
      {params: {member_id: 'self', access_token: accessToken}});
    if (result.error)
      throw result.error;

    return result.data.results && result.data.results[0];
  };
}) ();