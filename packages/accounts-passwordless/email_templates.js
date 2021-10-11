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
    html: (user, url, { sequence }) => {
      return `Hello!<br/>

Type the following token in our login form to get logged in:<br/><br/>
${sequence}<br/><br/>
Or if you want, you can click the following link to be automatically logged in:<br/><br/>
${url}<br/>

Thank you!
`;
    },
  },
};
