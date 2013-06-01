Meteor.loginWithTwitter = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Twitter.requestCredential(options, credentialRequestCompleteCallback);
};

//BOO
Meteor.linkWithTwitter = function (options, callback) {
	var credentialRequestCompleteCallback = Accounts.oauth.linkRequestCompleteHandler(callback);
	Twitter.requestCredential(options, credentialRequestCompleteCallback);
};

//BOO
Meteor.unlinkWithTwitter = function (options, callback) {
	options = options || {};
	options.serviceName = "twitter";
	Meteor.call("unlink", options, function unlinkWithTwitterCallback(err, result){
		if(callback){
			callback(result);
		}
	});
};