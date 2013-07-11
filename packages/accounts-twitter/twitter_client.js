Meteor.loginWithTwitter = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Twitter.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.linkWithTwitter = function (options, callback) {
	var credentialRequestCompleteCallback = Accounts.oauth.linkRequestCompleteHandler(callback);
	Twitter.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.unlinkWithTwitter = function (options, callback) {
	options = options || {};
	options.serviceName = "twitter";
	Meteor.call("unlink", options, function unlinkWithTwitterCallback(err, result){
		if(callback){
			callback(err, result);
		}
	});
};