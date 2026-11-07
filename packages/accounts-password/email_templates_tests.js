import { Accounts } from 'meteor/accounts-base';

const user = { _id: 'id', profile: { name: 'Ada' }, emails: [{ address: 'ada@example.com' }] };
const url = 'https://app.example.com/#/token/abc123';

Tinytest.add('passwords - shipped html emails greet the user, link the url and state the expiry', test => {
  const templates = Accounts._defaultEmailTemplates;

  const reset = templates.resetPassword.html(user, url);
  test.isTrue(reset.includes('Hello Ada,'));
  test.isTrue(reset.includes('Reset your password'));
  test.isTrue(reset.includes(`href="${url}"`));
  test.isTrue(reset.includes('This link expires in 3 days.'));

  const enroll = templates.enrollAccount.html(user, url);
  test.isTrue(enroll.includes(`Welcome to ${Accounts.emailTemplates.siteName}`));
  test.isTrue(enroll.includes('This link expires in 30 days.'));

  const verify = templates.verifyEmail.html(user, url);
  test.isTrue(verify.includes('Verify your email address'));
  test.isFalse(verify.includes('expires in'), 'verification links do not expire');
});
