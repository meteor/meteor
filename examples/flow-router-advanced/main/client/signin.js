"use strict"


////////////////////////////////////////////////////////////////////
// Signin
//

Template.signin.onRendered(function () {
  // auto-trigger accounts-ui login form dropdown
  Accounts._loginButtonsSession.set('dropdownVisible', true);
})
