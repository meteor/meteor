import { Accounts } from 'meteor/accounts-base';
import { DDP } from 'meteor/ddp';

export const insertUser = (email, services = {}) =>
  Accounts.insertUserDoc(
    {},
    { emails: [{ address: email, verified: false }], services }
  );

export const loginWithToken = async options => {
  const connection = DDP.connect(Meteor.absoluteUrl());
  try {
    return await connection.callAsync('login', options);
  } finally {
    connection.disconnect();
  }
};

export const requestLoginTokens = async email => {
  const originalHook = Accounts._onCreateLoginTokenHook;
  const originalSend = Accounts.sendLoginTokenEmail;
  let userToken;
  let resolveEmailToken;
  const emailToken = new Promise(resolve => {
    resolveEmailToken = resolve;
  });

  Accounts._onCreateLoginTokenHook = ({ token }) => {
    userToken = token;
    return true;
  };
  Accounts.sendLoginTokenEmail = async ({ sequence }) =>
    resolveEmailToken(sequence);

  try {
    await Meteor.server.method_handlers.requestLoginTokenForUser({
      selector: { email },
    });
    return { userToken, emailToken: await emailToken };
  } finally {
    Accounts._onCreateLoginTokenHook = originalHook;
    Accounts.sendLoginTokenEmail = originalSend;
  }
};
