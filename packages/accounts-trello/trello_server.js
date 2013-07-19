Accounts.oauth.registerService('trello');

Accounts.addAutopublishFields({
  forLoggedInUser: ['services.trello'],
  forOtherUsers: ['services.trello.fullName']
});