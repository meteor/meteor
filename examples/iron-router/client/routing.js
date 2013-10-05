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
    this.stop();

  } else {

    user = Meteor.user();

    if (!user) {

      console.log('filter: signin');
      this.render('signin');
      this.layout = 'layout_no_header';
      this.stop();
      return
    }

    if (!emailVerified(user)) {

      console.log('filter: awaiting-verification');
      this.render('awaiting-verification');
      this.layout = 'layout';
      this.stop();

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
    before: authenticate
  });
  this.route('start', {
    before: authenticate
  });

  this.route('signin');

  this.route('secrets', {
    //controller: 'AuthenticateController'
    before: authenticate
  });

  this.route('manage', {
    before: authenticate
  });

  this.route('signout', App.signout);

  // why is this necessary when notFoundTemplate is
  // set in Router.configure?
  this.route('*', {
    template: 'not_found'
  });
});

}());
