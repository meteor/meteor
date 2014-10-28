Accounts.onCreateUser(function(options, user) {
  if (options.profile)
    user.profile = options.profile;

  // If this is the first user going into the database, make them an admin
  if (Meteor.users.find().count() === 0)
    user.admin = true;

  return user;
});