;(function () {

  "use strict";


////////////////////////////////////////////////////////////////////
// Patches
//

// stubs for IE
if (!window.console) {
  window.console = {}
}
if (!window.console.log) {
  window.console.log = function (msg) {
    $('#log').append('<br /><p>' + msg + '</p>')
  };
}




// fix bootstrap dropdown unclickable issue on iOS
// https://github.com/twitter/bootstrap/issues/4550
$(document).on('touchstart.dropdown.data-api', '.dropdown-menu', function (e) {
    e.stopPropagation();
});



////////////////////////////////////////////////////////////////////
// Subscriptions
//

Deps.autorun(function () {
  // register dependency on user so subscriptions
  // will update once user has logged in
  var user = Meteor.user();

  // secrets
  Meteor.subscribe('secrets');

  // users, for manage-users page
  Meteor.subscribe('users');
});




////////////////////////////////////////////////////////////////////
// Routing
//

Meteor.Router.add({
  '/': function () {
    var user;

    if (Meteor.loggingIn()) {
      console.log('home: loading');
      return 'loading';
    }

    user = Meteor.user();
    if (!user) {
      console.log('home: signin');
      return 'signin';
    }

    console.log('home: user found');
    console.log(user.roles);

    // start on 'start' page
    console.log('home: start');
    return 'start';
  },
  '/signin': 'signin',
  '/start': 'start',
  '/secrets': 'secrets',
  '/manage': 'manage',
  '/signout': signout,
  '*': 'not_found'
});

Meteor.Router.filters({
  checkLoggedIn: function (page) {
    var user;

    if (Meteor.loggingIn()) {

      console.log('filter: loading');
      return 'loading';

    } else {

      user = Meteor.user();

      if (user) {

        console.log('filter: done');
        return page;

      } else {

        console.log('filter: signin');
        return 'signin';

      }
    }
  }
});

// make sure user has logged in for all appropriate routes
Meteor.Router.filter('checkLoggedIn', {
  except:['signin','loading','not-found']
});





////////////////////////////////////////////////////////////////////
// Templates
//

Template.signin.rendered = function () {
  // auto-trigger accounts-ui login form dropdown
  Accounts._loginButtonsSession.set('dropdownVisible', true);
};

Template.header.events({
  // template data, if any, is available in 'this'
  'click .btn-navbar' : openCloseNav
});
Template.header.helpers({
  displayName: function () {
    return displayName();
  }
});

Template.secrets.helpers({
  secrets: function () {
    return Meteor.secrets.find();
  }
});

Template.noteOfTheDay.helpers({
  note: function () {
    return "Greetings " + displayName() + "!";
  }
});

Template.manage.helpers({
  users: function () {
    return Meteor.users.find();
  },
  email: function () {
    return this.emails[0].address;
  },
  roles: function () {
    if (!this.roles) return '<none>';
    return this.roles.join(',');
  }
});





////////////////////////////////////////////////////////////////////
// Misc helper functions
//

function displayName (user) {
  var name;

  if (!user) {
    user = Meteor.user();
  }

  if (!user) return "<missing user>";

  if (user.profile) {
    name = user.profile.name;
  }

  if ('string' === typeof name) {
    name = name.trim();
  } else {
    name = null;
  }

  if (!name && user.emails && user.emails.length > 0) {
    name = user.emails[0].address;
  }

  return name || "<missing name>";
}


function signout () {
  console.log('logging out...');
  Meteor.logout(function () {
    console.log('...done');
    Meteor.Router.to('/');
  });
  
}

// insta-open/close nav rather than animate collapse.
// this improves UX on mobile devices
function openCloseNav (e) {
  // Select .nav-collapse within same .navbar as current button
  var nav = $(e.target).closest('.navbar').find('.nav-collapse');

  if (nav.height() != 0) {
    // If it has a height, hide it
    nav.height(0);
  } else {
    // If it's collapsed, show it
    nav.height('auto');
  }
}


}());
