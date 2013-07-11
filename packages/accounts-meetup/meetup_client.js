Meteor.loginWithMeetup = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Meetup.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.linkWithMeetup = function (options, callback) {
	var credentialRequestCompleteCallback = Accounts.oauth.linkRequestCompleteHandler(callback);
	Meetup.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.unlinkWithMeetup = function (options, callback) {
	options = options || {};
	options.serviceName = "meetup";
	Meteor.call("unlink", options, function unlinkWithMeetupCallback(err, result){
		if(callback){
			callback(err, result);
		}
	});
};