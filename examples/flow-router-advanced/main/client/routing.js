"use strict"


////////////////////////////////////////////////////////////////////
// Routing
//

// override with router-specific navigate method
App.navigateTo = function (path) {
  FlowRouter.go(path)
}


FlowRouter.notFound = {
  action: function () {
    BlazeLayout.render("publicLayout", {content: "t404"})
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

FlowRouter.route('/signout', {
    action: App.signout
})
