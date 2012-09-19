(function() {

  Meteor.accounts.qq.setSecret = function(secret) {
    Meteor.accounts.qq._secret = secret;
  };

  Meteor.accounts.oauth.registerService('qq', 2, function(query) {

    var accessToken = getAccessToken(query);
    var identity = getIdentity(accessToken.access_token);

    return {
      options : {
        services : {
          qq : {
            id : identity.openid,
            accessToken : accessToken.access_token,
            nickName : identity.name
          }
        }
      },
      extra : {
        name : identity.name
      }
    };
  });

  var getAccessToken = function(query) {
    var result = Meteor.http.get("https://graph.qq.com/oauth2.0/token", {
      params : {
        code : query.code,
        client_id : Meteor.accounts.qq._clientId,
        client_secret : Meteor.accounts.qq._secret,
        redirect_uri : Meteor.accounts.qq._appUrl + "/_oauth/qq?close",
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
      access_token : qqAccessToken
    };
  };

  var getIdentity = function(accessToken) {
    var openIdResult = Meteor.http.get("https://graph.qq.com/oauth2.0/me", {
      params : {
        access_token : accessToken
      }
    });
    if (openIdResult.error) {
      console.log("Error in getting account's open id, details: " + openIdResult.error);
      throw openIdResult.error;
    }

    var callback = function(openIdResult) {
      return openIdResult;
    }
    var openId = eval(openIdResult.content).openid;
    var userInfoResult = Meteor.http.get("https://graph.qq.com/user/get_user_info", {
      params : {
        access_token : accessToken,
        oauth_consumer_key : Meteor.accounts.qq._clientId,
        openid : openId
      }
    });
    if (userInfoResult.error) {
      console.log("Error in getting account's user information, details: " + userInfoResult.error);
      throw userInfoResult.error
    }
    var userInfo = JSON.parse(userInfoResult.content);
    return {
      openid : openId,
      name : userInfo.nickname
    };
  };
})();
