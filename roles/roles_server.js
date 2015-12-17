"use strict";

// Create default indexes for roles and users collection.

Meteor.roles._ensureIndex({name: 1}, {unique: 1});

Meteor.users._ensureIndex({'roles.role': 1});
Meteor.users._ensureIndex({'roles.partition': 1});
Meteor.users._ensureIndex({'roles.role': 1, 'roles.partition': 1});

/**
 * Publish logged-in user's roles so client-side checks can work.
 * 
 * Use a named publish function so clients can check `ready()` state.
 */
Meteor.publish('_roles', function () {
  var loggedInUserId = this.userId,
      fields = {roles: 1};

  if (!loggedInUserId) {
    this.ready();
    return;
  }

  return Meteor.users.find({_id: loggedInUserId},
                           {fields: fields});
});

Roles._forwardMigrate = function () {

};

Roles._backwardMigrate = function () {

};
