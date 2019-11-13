"use strict"


////////////////////////////////////////////////////////////////////
// Routing
//

// override with mini-pages navigate method
Meteor.navigateTo = function (path) {
  Router.go(path)
}

function emailVerified (user) {
  return user.emails.some(function (email) {
    return email.verified
  })
}

var filters = {

  /**
   * ensure user is logged in and
   * email verified
   */
  authenticate: function () {
    var user

    if (Meteor.loggingIn()) {

      console.log('[authenticate filter] loading')
      this.layout('layout_no_header')
      this.render('loading')

    } else {

      user = Meteor.user()

      if (!user) {
        console.log('[authenticate filter] signin')
        this.layout('layout_no_header')
        this.render('signin')
        return
      }

      if (!emailVerified(user)) {
        console.log('[authenticate filter] awaiting-verification')
        this.layout('layout')
        this.render('awaiting-verification')
        return
      }

      console.log('[authenticate filter] done')
      this.layout('layout')

      this.next()
    }
  },  // end authenticate

  /**
   * nop used to illustrate multiple filters
   * use-case
   */
  testFilter: function () {
    console.log('[test filter]')
    this.next()
  }

}  // end filters


Router.configure({
  layout: 'layout',
  loadingTemplate: 'loading',
  notFoundTemplate: 'not_found'
})


Router.route('/', {
  template: 'start',
  before: [filters.authenticate, filters.testFilter]
})
Router.route('/start', {
  before: [filters.authenticate, filters.testFilter]
})

Router.route('/secrets', {
  before: filters.authenticate
})
Router.route('/manageUsers', {
  before: filters.authenticate
})

Router.route('/signin')
Router.route('/signout', App.signout)
