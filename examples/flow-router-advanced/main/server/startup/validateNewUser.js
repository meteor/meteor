"use strict"

////////////////////////////////////////////////////////////////////
// Prevent non-authorized users from creating new users
//

Meteor.startup(function () {

  Accounts.validateNewUser(function (user) {
    if (Roles.userIsInRole(Meteor.userId(), ['admin','manage-users'])) {
      return true;
    }

    throw new Meteor.Error('unauthorized', "Not authorized to create new users");
  });

})
