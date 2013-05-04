;(function () {

  "use strict";


////////////////////////////////////////////////////////////////////
// Routing
//

// override with mini-pages navigate method
Meteor.navigateTo = function (path) {
  Meteor.go(path);
};

var authenticate = function () {
  var user;

  if (Meteor.loggingIn()) {

    console.log('filter: loading');
    this.template('loading');
    this.layout('layout_no_header');
    this.done();

  } else {

    user = Meteor.user();

    if (user) {

      console.log('filter: done');
      this.layout('layout');

    } else {

      console.log('filter: signin');
      this.template('signin');
      this.layout('layout_no_header');
      this.done();

    }
  }
};

Meteor.pages({
  '/': { to: 'start', as: 'root', nav: 'start', 
         before: [authenticate] },
  '/signin': 'signin',
  '/start': { to: 'start', nav: 'start', 
         before: [authenticate] },
  '/secrets': { to: 'secrets', nav: 'secrets', 
         before: [authenticate] },
  '/manage': { to: 'manage', nav: 'manage', 
         before: [authenticate] },
  '/signout': App.signout,
  '*': 'not_found'
}, {
  defaults: {
    layout: 'layout_no_header'
  }
});


}());
