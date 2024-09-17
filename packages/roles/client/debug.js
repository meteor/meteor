/* global Roles, localStorage */

// //////////////////////////////////////////////////////////
// Debugging helpers
//
// Run this in your browser console to turn on debugging
// for this package:
//
//   localstorage.setItem('Roles.debug', true)
//

Roles.debug = false

try {
  if (localStorage) {
    const temp = localStorage.getItem('Roles.debug')

    if (typeof temp !== 'undefined') {
      Roles.debug = !!temp
    }
  }
} catch (ex) {
  // ignore: accessing localStorage when its disabled throws
  // https://github.com/meteor/meteor/issues/5759
}
