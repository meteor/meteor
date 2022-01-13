import { Accounts } from "meteor/accounts-base";

// Used in the various functions below to handle errors consistently
const reportError = (error, callback) => {
  if (callback) {
    callback(error);
  } else {
    throw error;
  }
};


Accounts.has2FAEnabled = (selector, callback) => {
  Accounts.connection.call(
    'has2FAEnabled',
    selector,
    callback,
  );
};

Accounts.generateSvgCodeAndSaveSecret = (appName, callback) => {
  let cb = callback;
  if (typeof appName === "function") {
    cb = appName;
  }
  Accounts.connection.call(
    'generateSvgCodeAndSaveSecret',
    appName,
    cb,
  );
};


Accounts.enableUser2fa = (code, callback) => {
  if (!code) {
    return reportError(new Meteor.Error(400, 'Must provide a code to validate'), callback);
  }
  Accounts.connection.call(
    'enableUser2fa',
    code,
    callback,
  );
};


Accounts.disableUser2fa = callback => {
  Accounts.connection.call(
    'disableUser2fa',
    callback,
  );
};
