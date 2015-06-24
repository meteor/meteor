DDPRateLimiter.config([]);
DDPRateLimiter.addRule({
  userId: null,
  IPAddr: null,
  type: 'method',
  name: 'login'
}, 5, 1000);

if (Meteor.isClient) {
  testAsyncMulti("passwords - basic login with password", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.email = Random.id() + '-intercept@example.com';
      this.password = 'password';

      Accounts.createUser({
          username: this.username,
          email: this.email,
          password: this.password
        },
        expect(function () {}));
    },
    function (test, expect) {
      test.notEqual(Meteor.userId(), null);
    },
    function (test, expect) {
      Meteor.logout(expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user(), null);
      }));
    },
    function (test, expect) {
      var self = this;
      for (var i = 0; i < 5; i++) {
        Meteor.loginWithPassword(self.username, 'fakePassword', expect(
          function (error) {
            // Get 5 'User not found' 403 messages before rate limit is hit
            test.equal(error.error, 403);
          }));
      }
      Meteor.loginWithPassword(self.username, 'fakePassword', expect(
        function (error) {
          test.equal(error.error, 'too-many-requests');
        }));
    }
  ]);
};