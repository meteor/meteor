testAsyncMulti("passwords - basic login with password", [
  function (test, expect) {
    var self = this;
    // Setup the rate limiter rules
    Meteor.call('resetAndAddRuleToDDPRateLimiter', 1000, expect(function(error, result) {
        self.ruleId = result;
    }));
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
    // Cleanup
    Meteor.call('removeRuleFromDDPRateLimiter', self.ruleId, expect(function(error, result) {
        test.equal(result,true);
      }));
  }
]);

testAsyncMulti("test removing rule with rateLimited client lets them send new queries", [
    function(test, expect) {
      var self = this;
      // Setup the rate limiter rules
      Meteor.call('resetAndAddRuleToDDPRateLimiter', 5000, expect(function(error, result) {
        self.ruleId = result;
      }));
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
            // Call printCurrentListofRules to see all the rules on the server
            // Meteor.call('printCurrentListOfRules');
            test.equal(error.error, 403);
          }));
      }
      Meteor.loginWithPassword(self.username, 'fakePassword', expect(
        function (error) {
          test.equal(error.error, 'too-many-requests');
        }));
      // By removing the rule from the DDP rate limiter, we no longer restrict them even though they were rate limited
      Meteor.call('removeRuleFromDDPRateLimiter', self.ruleId, expect(function(error, result) {
        test.equal(result,true);
      }));
      //
      for (var i = 0; i < 10; i++) {
        Meteor.loginWithPassword(self.username, 'fakePassword', expect(
          function (error) {
            test.equal(error.error, 403);
        }));
      }
  }
  ]);
