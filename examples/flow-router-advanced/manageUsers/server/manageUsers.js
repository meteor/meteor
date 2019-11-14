"use strict"


////////////////////////////////////////////////////////////////////
// Publish
//


// Authorized users can manage user accounts
Meteor.publish("users", function () {

  if (Roles.userIsInRole(this.userId, ["admin","manage-users"])) {
    console.log('publishing users', this.userId)
    return [
      Meteor.roleAssignment.find({}),
      Meteor.users.find({}, {fields: {emails: 1, profile: 1}})
    ];
  } 

  this.stop()
  return
})
