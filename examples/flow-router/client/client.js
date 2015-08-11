"use strict";


////////////////////////////////////////////////////////////////////
// Routing stub
//
// Separate routing package details from general app code.
Meteor.navigateTo = function (path) {
  // ...over-ridden in routing.js
};




////////////////////////////////////////////////////////////////////
// App.signout
//
App.signout = function () {
  console.log('logging out...');
  Meteor.logout(function () {
    console.log('...done');
    Meteor.navigateTo('/');
  });
};




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

Template.noteOfTheDay.helpers({
  note: function () {
    return "Greetings " + displayName() + "!";
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
