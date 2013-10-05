;(function () {

  AuthenticateController = {};

  "use strict";



////////////////////////////////////////////////////////////////////
// Routing
//

// override with mini-pages navigate method
Meteor.navigateTo = function (path) {
  Router.go(path);
};

function emailVerified (user) {
  return _.some(user.emails, function (email) {
    return email.verified;
  });
}

var authenticate = function () {
  var user;

  if (Meteor.loggingIn()) {

    console.log('filter: loading');
    this.render('loading');
    this.layout = 'layout_no_header';

  } else {

    user = Meteor.user();

    if (!user) {

      console.log('filter: signin');
      this.render('signin');
      this.layout = 'layout_no_header';
      return;

    }

    if (!emailVerified(user)) {

      console.log('filter: awaiting-verification');
      this.render('awaiting-verification');
      this.layout = 'layout';

    } else {

      console.log('filter: done');
      this.layout = 'layout';

    }
  }
};

AuthenticateController = RouteController.extend({
  before: authenticate
});

Router.configure({
  layout: 'layout',
  loadingTemplate: 'loading'
});

Router.map(function () {
  this.route('start', {
    path: '/',
    onBeforeRun: function () {
      console.log('start run')
    },
    onBeforeReRun: function () {
      console.log('start re-run')
    },
    controller: 'AuthenticateController'
  });

  this.route('signin');
});


/*
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
*/


}());
