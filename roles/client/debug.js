"use strict"


////////////////////////////////////////////////////////////
// Debugging helpers
//
// Run this in your browser console to turn on debugging
// for this package:
//
//   localstorage.setItem('Roles.debug', true)
//

Roles.debug = false

if (localStorage) {
  var temp = localStorage.getItem("Roles.debug")

  if ('undefined' !== typeof temp) {
    Roles.debug = !!temp
  }
}
