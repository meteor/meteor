//
// a mechanism to intercept emails sent to addressing including
// the string "intercept", storing them in an array that can then
// be retrieved using the getInterceptedEmails method
//
const interceptedEmails = {}; // (email address) -> (array of options)

// add html email templates that just contain the url
Accounts.emailTemplates.resetPassword.html =
  Accounts.emailTemplates.enrollAccount.html =
  Accounts.emailTemplates.verifyEmail.html = (user, url) => url;

// override the from address
Accounts.emailTemplates.resetPassword.from =
  Accounts.emailTemplates.enrollAccount.from =
    Accounts.emailTemplates.verifyEmail.from = user => 'test@meteor.com';

// add a custom header to check against
Accounts.emailTemplates.headers = {
  'My-Custom-Header' : 'Cool'
};

EmailTest.hookSend(options => {
  const { to } = options;
  if (!to || !to.toUpperCase().includes('INTERCEPT')) {
    return true; // go ahead and send
  } else {
    if (!interceptedEmails[to])
      interceptedEmails[to] = [];

    interceptedEmails[to].push(options);
    return false; // skip sending
  }
});

Meteor.methods({
  getInterceptedEmails: email => {
    check(email, String);
    return interceptedEmails[email];
  },

  addEmailForTestAndVerify: email => {
    check(email, String);
    Meteor.users.update(
      {_id: Accounts.userId()},
      {$push: {emails: {address: email, verified: false}}});
    Accounts.sendVerificationEmail(Accounts.userId(), email);
  },

  createUserOnServer: email => {
    check(email, String);
    const userId = Accounts.createUser({ email });
    Accounts.sendEnrollmentEmail(userId);
    return Meteor.users.findOne(userId);
  }
});
