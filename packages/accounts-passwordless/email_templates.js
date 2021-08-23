/**
 * @summary Options to customize emails sent from the Accounts system.
 * @locus Server
 * @importFromPackage accounts-base
 */
Accounts.emailTemplates = {
  ...(Accounts.emailTemplates || {}),
  from: "Accounts Example <no-reply@example.com>",
  siteName: Meteor.absoluteUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''),

  sendLoginToken: {
    subject: () => `Your login token on ${Accounts.emailTemplates.siteName}`,
    text: (token, url) => {
      return `Hello!

Type the following token in our login webpage to be logged in:
${token}
If you want, you can click the following link to be automatically logged in:
${url}

Thanks.
`
    },
  },
};
