Meteor.loginWithGoogle = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Google.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.linkWithGoogle = function (options, callback) {
	var credentialRequestCompleteCallback = Accounts.oauth.linkRequestCompleteHandler(callback);
	Google.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.unlinkWithGoogle = function (options, callback) {
	options = options || {};
	options.serviceName = "google";
	Meteor.call("unlink", options, function unlinkWithGoogleCallback(err, result){
		if(callback){
			callback(err, result);
		}
	});
};