import { verifyCode } from "./utils";
import {Accounts} from "meteor/accounts-base";

// Used in the various functions below to handle errors consistently
const reportError = (error, callback) => {
  if (callback) {
    callback(error);
  } else {
    throw error;
  }
};
const originalLoginWithPassword = Meteor.loginWithPassword;

Meteor.loginWithPassword = (selector, password, callback) => {
  if (typeof selector === 'string') {
    if (!selector.includes('@')) {
      selector = {username: selector};
    } else {
      selector = {email: selector};
    }
  }

  Accounts.connection.call(
    'getUserTwoFactorAuthenticationData',
    { selector },
    (err, twoFactorAuthenticationData) => {
      const { type, secret } = twoFactorAuthenticationData || {};
      if (err) {
        reportError(err, callback);
        return;
      }
      if (type === "otp") {
        callback(null, code => {
          verifyCode({ secret, code});
          originalLoginWithPassword(selector, password, callback);
        });
        return;
      }
      originalLoginWithPassword(selector, password, callback);
    }
  );
};


Accounts.generateSvgCode = (appName, callback) => {
  let cb = callback;
  if (typeof appName === "function") {
    cb = appName;
  }
  Accounts.connection.call(
    'generateSvgCode',
    appName,
    cb,
  );
};


Accounts.enableUser2fa = (code, callback) => {
  if (!code) {
    return reportError(new Meteor.Error(400, 'Must pass a code to validate'), callback);
  }
  Accounts.connection.call(
    'enableUser2fa',
    code,
    callback,
  );
};
