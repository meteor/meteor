"use strict"


////////////////////////////////////////////////////////////////////
// Routing for Manage Users
//
// Authentication is handled in mainLayout.
// Authorization is handled in manageController and can be reused for any route.
//
FlowRouter.route('/manageUsers', {
  action: function () {
    BlazeLayout.render('mainLayout', {content: 'manageController',
                                      targetTemplate: 'manageUsers'})
  }
})
