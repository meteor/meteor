if (Meteor.isClient) {
  Tinytest.addAsync(
    'accounts - loggingIn flag works correctly with DDP.connect to different host',
    (test, done) => {
      const username = `testuser-${Random.id()}`;
      const password = `password-${Random.id()}`;
      Accounts.createUser({
        username: username,
        password: password
      }, (err) => {
        if (err) {
          test.fail('Failed to create user: ' + err.message);
          return done();
        }
        
        Meteor.logout(() => {
          const ddpConnection = DDP.connect(Meteor.absoluteUrl());
          const accountsClient = new AccountsClient({ connection: ddpConnection });
          test.isFalse(accountsClient.loggingIn(), 'loggingIn should start as false');
          
          accountsClient.loginWithPassword(username, password, (loginErr) => {
            if (loginErr) {
              test.fail('Login failed: ' + loginErr.message);
              ddpConnection.close();
              return done();
            }
            
            Meteor.setTimeout(() => {
              test.isFalse(accountsClient.loggingIn(), 'loggingIn should be false after successful login');
              test.isNotNull(accountsClient.userId(), 'User should be logged in on new connection');
              accountsClient.logout(() => {
                ddpConnection.close();
                Meteor.call('removeTestUser', username, () => {
                  done();
                });
              });
            }, 100);
          });
          
          test.isTrue(accountsClient.loggingIn(), 'loggingIn should be true during login');
        });
      });
    }
  );
}

if (Meteor.isServer) {
  Meteor.methods({
    removeTestUser: function(username) {
      Meteor.users.remove({ username: username });
    }
  });
}
