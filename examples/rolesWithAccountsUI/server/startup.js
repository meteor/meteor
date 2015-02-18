Meteor.startup(function () {

  console.log('Running server startup code...');

  Accounts.onCreateUser(function (options, user) {
    Roles.setRolesOnUserObj(user, ['admin','view-secrets']);

    if (options.profile) {
      // include the user profile
      user.profile = options.profile
    }

    // other user object changes...
    // ...
    
    return user;
  });

});
