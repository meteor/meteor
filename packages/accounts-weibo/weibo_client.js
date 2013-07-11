Meteor.loginWithWeibo = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Weibo.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.linkWithWeibo = function (options, callback) {
	var credentialRequestCompleteCallback = Accounts.oauth.linkRequestCompleteHandler(callback);
	Weibo.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.unlinkWithWeibo = function (options, callback) {
	options = options || {};
	options.serviceName = "Weibo";
	Meteor.call("unlink", options, function unlinkWithWeiboCallback(err, result){
		if(callback){
			callback(err, result);
		}
	});
};