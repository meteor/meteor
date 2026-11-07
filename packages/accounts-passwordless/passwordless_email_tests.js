import { Accounts } from 'meteor/accounts-base';

Tinytest.add('passwordless - shipped html email shows the code, the link and the expiry', test => {
  const { html } = Accounts._defaultEmailTemplates.sendLoginToken;
  const url = 'https://app.example.com/?loginToken=ABC123';
  const rendered = html({ username: 'ada' }, url, { sequence: 'ABC123' });
  test.isTrue(rendered.includes('Hello ada,'));
  test.isTrue(rendered.includes('>ABC123</td>'));
  test.isTrue(rendered.includes(`href="${url}"`));
  test.isTrue(rendered.includes('This code expires in 1 hour.'));
});
