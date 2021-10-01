const greet = welcomeMsg => (user, url) => {
      const greeting = (user.profile && user.profile.name) ?
            (`Hello ${user.profile.name},`) : "Hello,";
      return `${greeting}

${welcomeMsg}, simply click the link below.

${url}

Thanks.
`;
};

/**
 * @summary Options to customize emails sent from the Accounts system.
 * @locus Server
 * @importFromPackage accounts-base
 */
Accounts.emailTemplates = {
  from: "Accounts Example <no-reply@example.com>",
  siteName: Meteor.absoluteUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''),

  resetPassword: {
    subject: () => `How to reset your password on ${Accounts.emailTemplates.siteName}`,
    text: greet("To reset your password"),
  },
  verifyEmail: {
    subject: () => `How to verify email address on ${Accounts.emailTemplates.siteName}`,
    text: greet("To verify your account email"),
  },
  enrollAccount: {
    subject: () => `An account has been created for you on ${Accounts.emailTemplates.siteName}`,
    text: greet("To start using the service"),
  },
};
