(function() {
  Meteor.accounts.oauth.registerService('qq', 2, function(query) {
    var config = Meteor.accounts.configuration.findOne({
      service : 'qq'
    });
    if (!config) {
      throw new Meteor.accounts.ConfigError("QQ AuthService not configured");
    }

    var accessToken = getAccessToken(config, query);
    var identity = getIdentity(config, accessToken.accessToken);

    return {
      options : {
        services : {
          qq : {
            id : identity.id,
            accessToken : accessToken.accessToken
          }
        }
      },
      extra : {
        profile : {
          name : identity.name,
          figureUrl : identity.figureUrl,
          level : identity.level
        }
      }
    };
  });

  var getAccessToken = function(config, query) {
    var result = Meteor.http.get("https://graph.qq.com/oauth2.0/token", {
      params : {
        code : query.code,
        client_id : config.clientId,
        client_secret : config.secret,
        redirect_uri : Meteor.absoluteUrl("_oauth/qq?close"),
        grant_type : 'authorization_code'
      }
    });

    if (result.error) {
      console.log("Error in getting access token, details: " + result.error);
      throw result.error;
    }

    var qqAccessToken;
    _.each(result.content.split('&'), function(kvString) {
      var kvArray = kvString.split('=');
      if (kvArray[0] === 'access_token')
        qqAccessToken = kvArray[1];
    });
    return {
      accessToken : qqAccessToken
    };
  };

  var getIdentity = function(config, accessToken) {
    var meResult = Meteor.http.get("https://graph.qq.com/oauth2.0/me", {
      params : {
        access_token : accessToken
      }
    });

    // The response content in /me requires trickly JSONP callback to parse
    var callback = function(result) {
      return result;
    }
    var meContent = eval(meResult.content);
    if (meContent.error) {
      console.log("Error in getting account's open id, details: " + meContent.error);
      throw meContent.error;
    }

    var userInfoResult = Meteor.http.get("https://graph.qq.com/user/get_user_info", {
      params : {
        access_token : accessToken,
        oauth_consumer_key : config.clientId,
        openid : meContent.openid
      }
    });
    var userInfoContent = JSON.parse(userInfoResult.content);
    if (userInfoContent.ret) {// 'ret' > 0
      console.log("Error in getting account's user information, details: " + userInfoContent.msg);
      throw userInfoContent.msg
    }

    return {
      id : meContent.openid,
      name : userInfoContent.nickname,
      figureUrl : userInfoContent.figureurl,
      level : userInfoContent.level
    };
  };
})();
