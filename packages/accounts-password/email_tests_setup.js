(function () {
  //
  // a mechanism to intercept emails sent to addressing including
  // the string "intercept", storing them in an array that can then
  // be retrieved using the getInterceptedEmails method
  //
  var oldEmailSend = Email.send;
  var interceptedEmails = {}; // (email address) -> (array of contents)

  Email.send = function (options) {
    var to = options.to;
    if (to.indexOf('intercept') === -1) {
      oldEmailSend(options);
    } else {
      if (!interceptedEmails[to])
        interceptedEmails[to] = [];

      interceptedEmails[to].push(options.text);
    }
  };

  Meteor.methods({
    getInterceptedEmails: function (email) {
      return interceptedEmails[email];
    },

    addEmailForTestAndVerify: function (email) {
      Meteor.users.update(
        {_id: this.userId},
        {$push: {emails: {address: email, verified: false}}});
      Accounts.sendVerificationEmail(this.userId, email);
    },

    createUserOnServer: function (email) {
      var userId = Accounts.createUser({email: email});
      Accounts.sendEnrollmentEmail(userId);
      return Meteor.users.findOne(userId);
    }
  });
}) ();
