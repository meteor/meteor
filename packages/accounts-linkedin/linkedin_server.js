Accounts.oauth.registerService('linkedin');

Accounts.addAutopublishFields({
  // publish all fields including access token, which can legitimately
  // be used from the client (if transmitted over ssl or on
  // localhost). https://developer.linkedin.com/documents/authentication
  forLoggedInUser: ['services.linkedin'],
  forOtherUsers: [
    'services.linkedin.id', 'services.linkedin.firstName', 'services.linkedin.lastName'
  ]
});
