;(function () {

  "use strict";



////////////////////////////////////////////////////////////////////
// Patches
//

if (!console || !console.log) {
  // stub for IE
  console = { log: function () {} };
}

// fix bootstrap dropdown unclickable issue on iOS
// https://github.com/twitter/bootstrap/issues/4550
$(document).on('touchstart.dropdown.data-api', '.dropdown-menu', function (e) {
    e.stopPropagation();
})



////////////////////////////////////////////////////////////////////
// Subscriptions
//

// user's 'roles' field
Meteor.subscribe('ownUserData');

// secrets
Meteor.subscribe('secrets');

// users, for manage-users page
Meteor.subscribe('users');





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
    console.log('home: start')
    return 'start'
  },
  '/signin': 'signin',
  '/start': 'start',
  '/secrets': 'secrets',
  '/manage': 'manage',
  '*': 'not_found'
})

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
})





////////////////////////////////////////////////////////////////////
// Templates
//

Template.signin.rendered = function () {
  // auto-trigger accounts-ui login form dropdown
  Accounts._loginButtonsSession.set('dropdownVisible', true);
}

Template.header.events({
  // template data, if any, is available in 'this'
  'click a.nav-start' : handleNavClick,
  'click a.nav-secrets' : handleNavClick,
  'click a.nav-manage' : handleNavClick,
  'click #err .close' : clearError,
  'click .btn-navbar' : openCloseNav,
  'click .signout': signout
})
Template.header.helpers({
  displayName: function () {
    return displayName();
  },
  errorMsg: function () {
    return Session.get('error');
  }
})

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
  if (!user) {
    user = Meteor.user();
  }
  
  if (!user) return "<missing user>";

  if (user.profile) {
    name = user.profile.name;
  }

  name = name.trim();

  if (!name && user.emails && user.emails.length > 0) {
    name = user.emails[0].address;
  }

  return name || "<missing name>";
}


function handleNavClick (e) {
  var user = Meteor.user(),
      template;

  e.preventDefault();

  if (!user) return;

  try {
    // ex. ...class="nav-secrets"
    template = e.target.className.substring(4);
    console.log("You pressed the " + template + " button");
    Meteor.Router.to('/' + template);
  } 
  catch (err) {
    console.log(err);
  }
}

function clearError () {
  Session.set('error', '');
}

function signout (e) {
  e.preventDefault();
  console.log('logging out...');
  clearError();
  Meteor.logout();
  Meteor.Router.to('/');
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
