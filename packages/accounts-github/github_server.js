Accounts.oauth.registerService('github');

Accounts.addAutopublishFields({
  // not sure whether the github api can be used from the browser,
  // thus not sure if we should be sending access tokens; but we do it
  // for all other oauth2 providers, and it may come in handy.
  forLoggedInUser: ['services.github'],
  forOtherUsers: ['services.github.username']
});