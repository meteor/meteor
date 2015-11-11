"use strict"

//////////////////////////////////////////////////////////////////////
// secretsController
//
Template.secretsController.helpers({
  target: function () {
    var loggedInUserId = Meteor.userId()

    if (!Roles.userIsInRole(loggedInUserId, ['secrets', 'admin'])) {
      return 't404'
    } else {
      return this.targetTemplate
    }
  }
})
