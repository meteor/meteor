const greet = welcomeMsg => (user, url) => {
  const greeting =
    user.profile && user.profile.name
      ? `Hello ${user.profile.name},`
      : 'Hello,';
  return `${greeting}

${welcomeMsg}, simply click the link below.

${url}

Thank you.
`;
};

/**
 * @summary Options to customize emails sent from the Accounts system.
 * @locus Server
 * @importFromPackage accounts-base
 */
Accounts.emailTemplates = {
  ...(Accounts.emailTemplates || {}),
  from: 'Accounts Example <no-reply@example.com>',

  resetPassword: {
    subject: () =>
      `How to reset your password on ${Accounts.emailTemplates.siteName}`,
    text: greet('To reset your password'),
    html: (user, url) =>
      Accounts.emailTemplates.layout({
        user,
        heading: 'Reset your password',
        intro:
          'Someone asked to reset the password of your account. If that was you, choose a new password with the button below.',
        buttonLabel: 'Reset password',
        url,
        expiresIn: Accounts._getPasswordResetTokenLifetimeMs(),
        outro:
          'If you did not ask for this, you can safely ignore this email. Your password stays unchanged.',
      }),
  },
  verifyEmail: {
    subject: () =>
      `How to verify email address on ${Accounts.emailTemplates.siteName}`,
    text: greet('To verify your account email'),
    html: (user, url) =>
      Accounts.emailTemplates.layout({
        user,
        heading: 'Verify your email address',
        intro:
          'Confirm that this address belongs to your account with the button below.',
        buttonLabel: 'Verify email',
        url,
        outro: 'If you did not create this account, you can ignore this email.',
      }),
  },
  enrollAccount: {
    subject: () =>
      `An account has been created for you on ${Accounts.emailTemplates.siteName}`,
    text: greet('To start using the service'),
    html: (user, url) =>
      Accounts.emailTemplates.layout({
        user,
        heading: `Welcome to ${Accounts.emailTemplates.siteName}`,
        intro:
          'An account has been created for you. Choose your password to start using it.',
        buttonLabel: 'Set up my account',
        url,
        expiresIn: Accounts._getPasswordEnrollTokenLifetimeMs(),
        outro:
          'If you were not expecting this invitation, you can ignore this email.',
      }),
  },
};

['resetPassword', 'verifyEmail', 'enrollAccount'].forEach(reason => {
  const { text, html } = Accounts.emailTemplates[reason];
  Accounts._defaultEmailTemplates[reason] = { text, html };
});
