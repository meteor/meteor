// The application
App = {}

"use strict"

Object.assign(App, {

  // Separate routing package details from general app code.
  navigateTo: function (path) {
    // ...over-ridden in routing.js
  },

  signout: function () {
    console.log('logging out...');
    Meteor.logout(function () {
      console.log('...done');
      App.navigateTo('/');
    });
  },

  displayName: function (user) {
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

})
