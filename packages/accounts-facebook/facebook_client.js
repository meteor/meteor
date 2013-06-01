Meteor.loginWithFacebook = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Facebook.requestCredential(options, credentialRequestCompleteCallback);
};

//BOO
Meteor.linkWithFacebook = function (options, callback) {
	var credentialRequestCompleteCallback = Accounts.oauth.linkRequestCompleteHandler(callback);
	Facebook.requestCredential(options, credentialRequestCompleteCallback);
};

//BOO
Meteor.unlinkWithFacebook = function (options, callback) {
	options = options || {};
	options.serviceName = "facebook";
	Meteor.call("unlink", options, function unlinkWithFacebookCallback(err, result){
		if(callback){
			callback(result);
		}
	});
};