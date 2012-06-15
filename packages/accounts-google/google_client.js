(function () {
  Meteor.loginWithGoogle = function () {
    if (!Meteor.accounts.google._clientId || !Meteor.accounts.google._appUrl)
      throw new Meteor.accounts.google.SetupError("Need to call Meteor.accounts.google.setup first");

    var state = Meteor.uuid();
    // XXX need to support configuring access_type and scope
    var loginUrl =
          'https://accounts.google.com/o/oauth2/auth' +
          '?response_type=code' +
          '&client_id=' + Meteor.accounts.google._clientId +
          '&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile' +
          '&redirect_uri=' + Meteor.accounts.google._appUrl + '/_oauth/google?close' +
          '&state=' + state;

    Meteor.accounts.oauth2.initiateLogin(state, loginUrl);
  };

}) ();
