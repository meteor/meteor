(function () {
    var connect = __meteor_bootstrap__.require("connect");

    // connect middleware
    Accounts.oauth2._handleRequest = function (service, query, res) {
        // check if user authorized access
        if (!query.error) {
            // Prepare the login results before returning.  This way the
            // subsequent call to the `login` method will be immediate.

            // Run service-specific handler.
            var oauthResult = service.handleOauthRequest(query);

            // Get or create user doc and login token for reconnect.
            Accounts.oauth._loginResultForState[query.state] =
                Accounts.updateOrCreateUserFromExternalService(
                    service.serviceName, oauthResult.serviceData, oauthResult.options);
        }

        // Either close the window, redirect, or render nothing
        // if all else fails
        Accounts.oauth._renderOauthResults(res, query);
    };

    Accounts.oauth2.http = {
        call: call,
        get: wrapHttpCall('get'),
        put: wrapHttpCall('put'),
        'delete': wrapHttpCall('delete'),
        post: wrapHttpCall('post'),
        getNewAccessToken: getNewAccessToken,
        GOOGLE: {
            name: 'google',
            url: 'https://accounts.google.com/o/oauth2/token'
        }
    };

    function wrapHttpCall(method) {
        return function (service) {
            var args = [service, method].concat(Array.prototype.slice.call(arguments, 1));
            return call.apply(undefined, args);
        }
    }

    function call(service, method, url, options) {
        var result = doCall();
        if (result.statusCode === 401) {
            var newAccessToken = getNewAccessToken(service);
            if (newAccessToken) {
                storeNewAccessToken(service, newAccessToken);
                return doCall();
            }
        }
        return result;


        function doCall() {
            options = options || {};
            options.headers = _.extend(options.headers || {}, {
                Authorization: 'Bearer ' + getAuthInfo(service).accessToken
            });
            return Meteor.http.call(method, url, options);
        }
    }

    function getAuthInfo(service) {
        return Meteor.users.findOne(Meteor.userId()).services[service.name];
    }

    function getNewAccessToken(service) {
        var result = Meteor.http.post(service.url, {headers: {'Content-Type': 'application/x-www-form-urlencoded'}, content: oAuthRefreshBody(service)});
        return result.data && result.data.access_token;
    }

    function oAuthRefreshBody(service) {
        var loginServiceConfig = Accounts.loginServiceConfiguration.findOne({service: service.name});
        return 'refresh_token=' + getAuthInfo(service).refreshToken +
            '&client_id=' + loginServiceConfig.clientId +
            '&client_secret=' + loginServiceConfig.secret +
            '&grant_type=' + 'refresh_token';
    }

    function storeNewAccessToken(service, newAccessToken) {
        var o = {};
        o['services.' + service.name + '.accessToken'] = newAccessToken;
        Meteor.users.update(Meteor.userId(), {$set: o});
    }


})();
