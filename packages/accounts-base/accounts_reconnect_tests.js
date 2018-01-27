if (Meteor.isServer) {
  Meteor.methods({
    getConnectionUserId: function() {
      return this.userId;
    }
  });
}

if (Meteor.isClient) {
  const loginAsUser1 = (onUser1LoggedIn) => {
    Accounts.createUser({
      username: `testuser1-${Random.id()}`,
      password: `password1-${Random.id()}`
    }, onUser1LoggedIn);
  };

  Tinytest.addAsync('accounts - reconnect auto-login', (test, done) => {
    let onReconnectCalls = 0;
    const reconnectHandler = () => onReconnectCalls++;
    Meteor.connection.onReconnect = reconnectHandler;

    const username2 = `testuser2-${Random.id()}`;
    const password2 = `password2-${Random.id()}`;
    let timeoutHandle;
    let onLoginStopper;

    loginAsUser1((err) => {
      test.isUndefined(err, 'Unexpected error logging in as user1');
      Accounts.createUser({
        username: username2,
        password: password2
      }, onUser2LoggedIn);
    });

    const onUser2LoggedIn = err => {
      test.isUndefined(err, 'Unexpected error logging in as user2');
      onLoginStopper = Accounts.onLogin(onUser2LoggedInAfterReconnect);
      Meteor.disconnect();
      Meteor.reconnect();
    }

    const onUser2LoggedInAfterReconnect = () => {
      onLoginStopper.stop();
      Meteor.loginWithPassword('non-existent-user', 'or-wrong-password',
        onFailedLogin);
    }

    const onFailedLogin = err => {
      test.instanceOf(err, Meteor.Error, 'No Meteor.Error on login failure');
      onLoginStopper = Accounts.onLogin(onUser2LoggedInAfterReconnectAfterFailedLogin);
      Meteor.disconnect();
      Meteor.reconnect();
      timeoutHandle = Meteor.setTimeout(failTest, 1000);
    }

    const failTest = () => {
      onLoginStopper.stop();
      test.fail('Issue #4970 has occured.');
      Meteor.call('getConnectionUserId', checkFinalState);
    }

    const onUser2LoggedInAfterReconnectAfterFailedLogin = () => {
      onLoginStopper.stop();
      Meteor.clearTimeout(timeoutHandle);
      Meteor.call('getConnectionUserId', checkFinalState);
    }

    const checkFinalState = (err, connectionUserId) => {
      test.isUndefined(err, 'Unexpected error calling getConnectionUserId');
      test.equal(connectionUserId, Meteor.userId(),
        'userId is different on client and server');
      test.equal(Meteor.connection.onReconnect, reconnectHandler,
        'Meteor.connection.onReconnect changed');
      test.equal(onReconnectCalls, 2, 'wrong # of reconnect handler calls');
      done();
    }
  });

  // Make sure that when a logged in user is disconnected then reconnected,
  // they still only have one Accounts login onReconnect callback set.
  // Addresses: https://github.com/meteor/meteor/issues/9140
  Tinytest.addAsync(
    'accounts - verify single onReconnect callback',
    (test, done) => {
      loginAsUser1((err) => {
        test.isUndefined(err, 'Unexpected error logging in as user1');
        test.equal(
          Object.keys(DDP._reconnectHook.callbacks).length,
          1,
          'Only one onReconnect callback should be registered'
        );
        Meteor.disconnect();
        test.isFalse(Meteor.status().connected);
        Meteor.reconnect();
        setTimeout(() => {
          test.isTrue(Meteor.status().connected);
          test.equal(
            Object.keys(DDP._reconnectHook.callbacks).length,
            1,
            'Only one onReconnect callback should be registered'
          );
          done();
        }, 1000);
      });
    }
  );
}
