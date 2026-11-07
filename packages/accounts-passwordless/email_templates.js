/**
 * @summary Options to customize emails sent from the Accounts system.
 * @locus Server
 * @importFromPackage accounts-base
 */
Accounts.emailTemplates = {
  ...(Accounts.emailTemplates || {}),
  sendLoginToken: {
    subject: () => `Your login token for ${Accounts.emailTemplates.siteName}`,
    text: (user, url, { sequence }) => {
      return `Hello!

Type the following token in our login form to get logged in:
${sequence}
Or if you want, you can click the following link to be automatically logged in:
${url}

Thank you!
`;
    },
    html: (user, url, { sequence }) =>
      Accounts.emailTemplates.layout({
        user,
        heading: 'Your login code',
        intro:
          'Type this code in the login form, or use the button to sign in directly.',
        code: sequence,
        buttonLabel: 'Sign in',
        url,
        expiresIn: (Accounts._options.loginTokenExpirationHours || 1) * 3600000,
        outro: 'If you did not request this code, you can ignore this email.',
      }),
  },
};

Accounts._defaultEmailTemplates.sendLoginToken = {
  text: Accounts.emailTemplates.sendLoginToken.text,
  html: Accounts.emailTemplates.sendLoginToken.html,
};
