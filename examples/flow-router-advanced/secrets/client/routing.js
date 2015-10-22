"use strict"

////////////////////////////////////////////////////////////////////
// Routing for Secrets
//
// Authentication is handled in mainLayout.
// Authorization is handled in secretsController and can be reused for any route.
//
FlowRouter.route('/secrets', {
  action: function () {
    BlazeLayout.render('mainLayout', {content: 'secretsController',
                                      targetTemplate: 'secrets'})
  }
})
