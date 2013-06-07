Accounts.oauth.registerService('weibo');

Accounts.addAutopublishFields({
  // publish all fields including access token, which can legitimately
  // be used from the client (if transmitted over ssl or on localhost)
  forLoggedInUser: ['services.weibo'],
  forOtherUsers: ['services.weibo.screenName']
});