import { Accounts } from 'meteor/accounts-base';

const URL = 'https://app.example.com/#/reset-password/abc123';

// Runs `fn` with the given email template fields, then puts the originals back.
const withEmailTemplates = async (fields, fn) => {
  const originals = Object.fromEntries(
    Object.keys(fields).map(key => [key, Accounts.emailTemplates[key]])
  );
  Object.assign(Accounts.emailTemplates, fields);
  try {
    return await fn();
  } finally {
    Object.assign(Accounts.emailTemplates, originals);
  }
};

Tinytest.add('accounts - email layout greets by profile name, then username', test => {
  const { layout } = Accounts.emailTemplates;
  test.isTrue(layout({ user: { profile: { name: 'Ada' }, username: 'ada' } }).includes('Hello Ada,'));
  test.isTrue(layout({ user: { username: 'ada' } }).includes('Hello ada,'));
  test.isTrue(layout({ user: {} }).includes('Hello,'));
  test.isTrue(layout({ user: { username: 'ada' }, greeting: 'Hi there' }).includes('Hi there'));
});

Tinytest.add('accounts - email layout escapes the strings it is given', test => {
  const html = Accounts.emailTemplates.layout({
    user: { profile: { name: '<script>alert(1)</script>' } },
    heading: 'Tom & "Jerry"',
    url: 'https://app.example.com/?a=1&b=<2>',
  });
  test.isFalse(html.includes('<script>'));
  test.isTrue(html.includes('Hello &lt;script&gt;alert(1)&lt;/script&gt;,'));
  test.isTrue(html.includes('Tom &amp; &quot;Jerry&quot;'));
  test.isTrue(html.includes('href="https://app.example.com/?a=1&amp;b=&lt;2&gt;"'));
});

Tinytest.addAsync('accounts - email layout shows the site name, or the logo when set', async test => {
  await withEmailTemplates({ siteName: 'Awesome <App>', logoUrl: null }, () => {
    const html = Accounts.emailTemplates.layout({ heading: 'Hi' });
    test.isTrue(html.includes('>Awesome &lt;App&gt;</td>'));
    test.isTrue(html.includes('Sent by Awesome &lt;App&gt;'));
    test.isFalse(html.includes('<img'));
  });
  await withEmailTemplates(
    { siteName: 'Awesome', logoUrl: 'https://cdn.example.com/logo.png' },
    () => {
      const html = Accounts.emailTemplates.layout({ heading: 'Hi' });
      test.isTrue(html.includes('<img src="https://cdn.example.com/logo.png" alt="Awesome"'));
    }
  );
});

Tinytest.addAsync('accounts - email layout renders the button in the accent color and prints the url', async test => {
  await withEmailTemplates({ accentColor: '#123456' }, () => {
    const html = Accounts.emailTemplates.layout({ buttonLabel: 'Reset password', url: URL });
    test.isTrue(html.includes('background:#123456;'));
    test.isTrue(html.includes(`<a href="${URL}" style="display:inline-block;`));
    test.isTrue(html.includes('If the button does not work, copy this link into your browser:'));
    test.equal(html.split(URL).length - 1, 3, 'button, link href and link text');
  });
  const withoutButton = Accounts.emailTemplates.layout({ url: URL });
  test.isTrue(withoutButton.includes('Open this link in your browser:'));
  test.isFalse(withoutButton.includes('display:inline-block'));
});

Tinytest.add('accounts - email layout writes the expiry of a link or a code', test => {
  const { layout } = Accounts.emailTemplates;
  test.isTrue(layout({ url: URL, expiresIn: 3 * 86400000 }).includes('This link expires in 3 days.'));
  test.isTrue(layout({ url: URL, expiresIn: 86400000 }).includes('This link expires in 1 day.'));
  test.isTrue(layout({ url: URL, expiresIn: 90 * 60000 }).includes('This link expires in 90 minutes.'));
  test.isTrue(layout({ code: 'ABC123', expiresIn: 3600000 }).includes('This code expires in 1 hour.'));
  test.isFalse(layout({ url: URL }).includes('expires in'));
});

Tinytest.add('accounts - email layout body replaces the card content and is not escaped', test => {
  const html = Accounts.emailTemplates.layout({
    user: { username: 'ada' },
    heading: 'Ignored',
    body: '<p>Custom <b>content</b></p>',
  });
  test.isTrue(html.includes('<p>Custom <b>content</b></p>'));
  test.isFalse(html.includes('<h1'), 'the heading only feeds the document title');
  test.isFalse(html.includes('Hello ada,'));
});

Tinytest.addAsync('accounts - shipped email html only accompanies the shipped text', async test => {
  const defaults = Accounts._defaultEmailTemplates.resetPassword;
  test.isTrue(!!defaults, 'accounts-password registers its templates');
  const template = Accounts.emailTemplates.resetPassword;
  const original = { text: template.text, html: template.html };
  const user = { _id: 'id', username: 'ada', emails: [{ address: 'ada@example.com' }] };
  const options = () => Accounts.generateOptionsForEmail('ada@example.com', user, URL, 'resetPassword');
  try {
    // Start from the shipped pair: other packages' test setups may have replaced the html.
    Object.assign(template, defaults);
    let email = await options();
    test.isTrue(email.text.includes(URL));
    test.isTrue(email.html.includes(URL), 'default text and html: both sent');

    template.text = () => 'custom text';
    email = await options();
    test.equal(email.text, 'custom text');
    test.isUndefined(email.html, 'custom text, shipped html: text only');

    template.html = () => '<p>custom html</p>';
    email = await options();
    test.equal(email.html, '<p>custom html</p>', 'both customized: both sent');
  } finally {
    Object.assign(template, original);
  }
});
