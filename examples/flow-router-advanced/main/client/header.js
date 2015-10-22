"use strict"


////////////////////////////////////////////////////////////////////
// Header
//
Template.header.events({
  // template data, if any, is available in 'this'
  'click .btn-navbar' : openCloseNav
})

Template.header.helpers({
  displayName: function () {
    return App.displayName()
  }
})




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
