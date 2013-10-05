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
    this.template = 'loading';
    this.layout = 'layout_no_header';

  } else {

    user = Meteor.user();

    if (!user) {

      console.log('filter: signin');
      this.template = 'signin';
      this.layout = 'layout_no_header';
      return;

    }

    if (!emailVerified(user)) {

      console.log('filter: awaiting-verification');
      this.template = 'awaiting-verification';
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
  loadingTemplate: 'loading',
  notFoundTemplate: 'not_found'
});

Router.map(function () {
  this.route('start', {
    path: '/',
    controller: 'AuthenticateController'
  });
  this.route('start', {
    path: '/start',
    controller: 'AuthenticateController'
  });

  this.route('signin');

  this.route('secrets', {
    path: '/secrets',
    controller: 'AuthenticateController'
  });

  this.route('manage', {
    path: '/manage',
    controller: 'AuthenticateController'
  });

  this.route('signout', App.signout);

  // why is this necessary when notFoundTemplate is
  // set in Router.configure?
  this.route('*', {
    template: 'not_found'
  });
});

}());
