if (Meteor.isServer) {
  Meteor.methods({
    getConnectionUserId: function() {
      return this.userId;
    }
  });
}

if (Meteor.isClient) {
  Tinytest.addAsync('accounts - reconnect auto-login', function(test, done) {
    var username1 = 'testuser1-' + Random.id();
    var username2 = 'testuser2-' + Random.id();
    var password1 = 'password1-' + Random.id();
    var password2 = 'password2-' + Random.id();
    var timeoutHandle;
    var onLoginStopper;

    loginAsUser1();

    function loginAsUser1() {
      Accounts.createUser({
        username: username1,
        password: password1
      }, onUser1LoggedIn);
    }

    function onUser1LoggedIn(err) {
      test.isUndefined(err, 'Unexpected error logging in as user1');
      Accounts.createUser({
        username: username2,
        password: password2
      }, onUser2LoggedIn);
    }

    function onUser2LoggedIn(err) {
      test.isUndefined(err, 'Unexpected error logging in as user2');
      onLoginStopper = Accounts.onLogin(onUser2LoggedInAfterReconnect);
      Meteor.disconnect();
      Meteor.reconnect();
    }

    function onUser2LoggedInAfterReconnect() {
      onLoginStopper.stop();
      Meteor.loginWithPassword('non-existent-user', 'or-wrong-password',
        onFailedLogin);
    }

    function onFailedLogin(err) {
      test.instanceOf(err, Meteor.Error, 'No Meteor.Error on login failure');
      onLoginStopper = Accounts.onLogin(onUser2LoggedInAfterReconnectAfterFailedLogin);
      Meteor.disconnect();
      Meteor.reconnect();
      timeoutHandle = Meteor.setTimeout(failTest, 1000);
    }

    function failTest() {
      onLoginStopper.stop();
      test.fail('Issue #4970 has occured.');
      Meteor.call('getConnectionUserId', checkFinalState);
    }

    function onUser2LoggedInAfterReconnectAfterFailedLogin() {
      onLoginStopper.stop();
      Meteor.clearTimeout(timeoutHandle);
      Meteor.call('getConnectionUserId', checkFinalState);
    }

    function checkFinalState(err, connectionUserId) {
      test.isUndefined(err, 'Unexpected error calling getConnectionUserId');
      test.equal(connectionUserId, Meteor.userId(),
        'userId is different on client and server');
      done();
    }
  });
}
