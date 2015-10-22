"use strict"

//////////////////////////////////////////////////////////////////////
// manageController
//
Template.manageController.helpers({
  target: function () {
    var loggedInUserId = Meteor.userId()

    if (!Roles.userIsInRole(loggedInUserId, ['manage-users', 'admin'])) {
      return 't404'
    } else {
      return this.targetTemplate
    }
  }
})
