Meteor.loginWithFacebook = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Facebook.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.linkWithFacebook = function (options, callback) {
	var credentialRequestCompleteCallback = Accounts.oauth.linkRequestCompleteHandler(callback);
	Facebook.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.unlinkWithFacebook = function (options, callback) {
	options = options || {};
	options.serviceName = "facebook";
	Meteor.call("unlink", options, function unlinkWithFacebookCallback(err, result){
		if (callback){
			callback(err, result);
		}
	});
};