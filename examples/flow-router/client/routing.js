"use strict"


////////////////////////////////////////////////////////////////////
// Routing
//

// override with mini-pages navigate method
Meteor.navigateTo = function (path) {
  FlowRouter.go(path)
}


FlowRouter.notFound = {
  action: function () {
    BlazeLayout.render("noHeaderLayout", {content: "not_found"})
  }
}

FlowRouter.route('/', {
  action: function () {
    BlazeLayout.render('mainLayout', {content: 'start'})
  }
})

FlowRouter.route('/start', {
  action: function () {
    BlazeLayout.render('mainLayout', {content: 'start'})
  }
})

FlowRouter.route('/signin', {
  action: function () {
    BlazeLayout.render('mainLayout', {content: 'signin'})
  }
})

FlowRouter.route('/secrets', {
  action: function () {
    BlazeLayout.render('mainLayout', {content: 'secrets'})
  }
})

FlowRouter.route('/manageUsers', {
  action: function () {
    BlazeLayout.render('mainLayout', {content: 'manageUsers'})
  }
})

FlowRouter.route('/signout', {
    action: App.signout
})
