;(function () {

  //AuthenticateController = {};

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

var filters = {

  /**
   * ensure user is logged in and 
   * email verified
   */
  authenticate: function () {
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
  },  // end authenticate

  /**
   * nop used to illustrate multiple filters
   * use-case
   */
  testFilter: function () {
    console.log('test filter')
  }

};  // end filters

//AuthenticateController = RouteController.extend({
//  before: authenticate
//});


Router.configure({
  layout: 'layout',
  loadingTemplate: 'loading',
  notFoundTemplate: 'not_found'
});

Router.map(function () {
  this.route('start', {
    path: '/',
    before: [filters.authenticate, filters.testFilter]
  });
  this.route('start', {
    before: [filters.authenticate, filters.testFilter]
  });

  this.route('signin');

  this.route('secrets', {
    //controller: 'AuthenticateController'
    before: filters.authenticate
  });

  this.route('manage', {
    before: filters.authenticate
  });

  this.route('signout', App.signout);

  // why is this necessary when notFoundTemplate is
  // set in Router.configure?
  this.route('*', {
    template: 'not_found'
  });
});

}());
