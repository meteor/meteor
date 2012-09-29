(function () {
    Meteor.loginWithInstagram = function (callback) {
        var config = Meteor.accounts.configuration.findOne({service: 'instagram'});
        if (!config) {
            callback && callback(new Meteor.accounts.ConfigError("Service not configured"));
            return;
        }

        var state = Meteor.uuid();
        // XXX need to support configuring access_type and scope
        var loginUrl =
            'https://instagram.com/oauth/authorize' +
                '?client_id=' + config.clientId +
                '&redirect_uri=' + Meteor.absoluteUrl('_oauth/instagram?close=close', {replaceLocalhost: true}) +
                '&response_type=code' +
                '&state=' + state;

        Meteor.accounts.oauth.initiateLogin(state, loginUrl, callback);
    };

}) ();
