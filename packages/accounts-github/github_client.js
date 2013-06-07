Meteor.loginWithGithub = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Github.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.linkWithGithub = function (options, callback) {
	var credentialRequestCompleteCallback = Accounts.oauth.linkRequestCompleteHandler(callback);
	Github.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.unlinkWithGithub = function (options, callback) {
	options = options || {};
	options.serviceName = "github";
	Meteor.call("unlink", options, function unlinkWithGithubCallback(err, result){
		if(callback){
			callback(err, result);
		}
	});
};