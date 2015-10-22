"use strict"


////////////////////////////////////////////////////////////////////
// Publish
//


// Authorized users can view secrets
Meteor.publish("secrets", function () {

  if (Roles.userIsInRole(this.userId, ["admin","view-secrets"])) {
    console.log('publishing secrets', this.userId)
    return Meteor.secrets.find()
  }

  this.stop()
  return
})
