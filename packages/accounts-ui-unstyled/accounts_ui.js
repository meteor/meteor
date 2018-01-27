/**
 * @summary Accounts UI
 * @namespace
 * @memberOf Accounts
 * @importFromPackage accounts-base
 */
Accounts.ui = {};

Accounts.ui._options = {
  requestPermissions: {},
  requestOfflineToken: {},
  forceApprovalPrompt: {}
};

// XXX refactor duplicated code in this function

/**
 * @summary Configure the behavior of [`{{> loginButtons}}`](#accountsui).
 * @locus Client
 * @param {Object} options
 * @param {Object} options.requestPermissions Which [permissions](#requestpermissions) to request from the user for each external service.
 * @param {Object} options.requestOfflineToken To ask the user for permission to act on their behalf when offline, map the relevant external service to `true`. Currently only supported with Google. See [Meteor.loginWithExternalService](#meteor_loginwithexternalservice) for more details.
 * @param {Object} options.forceApprovalPrompt If true, forces the user to approve the app's permissions, even if previously approved. Currently only supported with Google.
 * @param {String} options.passwordSignupFields Which fields to display in the user creation form. One of '`USERNAME_AND_EMAIL`', '`USERNAME_AND_OPTIONAL_EMAIL`', '`USERNAME_ONLY`', or '`EMAIL_ONLY`' (default).
 * @importFromPackage accounts-base
 */
Accounts.ui.config = options => {
  // validate options keys
  const VALID_KEYS = ['passwordSignupFields', 'requestPermissions', 'requestOfflineToken', 'forceApprovalPrompt'];
  Object.keys(options).forEach(key => {
    if (!VALID_KEYS.includes(key))
      throw new Error(`Accounts.ui.config: Invalid key: ${key}`);
  });

  // deal with `passwordSignupFields`
  if (options.passwordSignupFields) {
    if (options.passwordSignupFields.reduce((prev, field) => 
      prev && 
      [
        "USERNAME_AND_EMAIL",
        "USERNAME_AND_OPTIONAL_EMAIL",
        "USERNAME_ONLY",
        "EMAIL_ONLY"
      ].includes(field),
      true
    )) {
      if (Accounts.ui._options.passwordSignupFields)
        throw new Error("Accounts.ui.config: Can't set `passwordSignupFields` more than once");
      else
        Accounts.ui._options.passwordSignupFields = options.passwordSignupFields;
    } else {
      throw new Error(`Accounts.ui.config: Invalid option for \`passwordSignupFields\`: ${options.passwordSignupFields}`);
    }
  }

  // deal with `requestPermissions`
  if (options.requestPermissions) {
    Object.keys(options.requestPermissions).forEach(service => {
      const scope = options.forceApprovalPrompt[service];
      if (Accounts.ui._options.requestPermissions[service]) {
        throw new Error(`Accounts.ui.config: Can't set \`requestPermissions\` more than once for ${service}`);
      } else if (!Array.isArray(scope)) {
        throw new Error("Accounts.ui.config: Value for `requestPermissions` must be an array");
      } else {
        Accounts.ui._options.requestPermissions[service] = scope;
      }
    });
  }

  // deal with `requestOfflineToken`
  if (options.requestOfflineToken) {
    Object.keys(options.requestOfflineToken).forEach(service => {
      const value = options.forceApprovalPrompt[service];
      if (service !== 'google')
        throw new Error("Accounts.ui.config: `requestOfflineToken` only supported for Google login at the moment.");

      if (Accounts.ui._options.requestOfflineToken[service]) {
        throw new Error(`Accounts.ui.config: Can't set \`requestOfflineToken\` more than once for ${service}`);
      } else {
        Accounts.ui._options.requestOfflineToken[service] = value;
      }
    });
  }

  // deal with `forceApprovalPrompt`
  if (options.forceApprovalPrompt) {
    Object.keys(options.forceApprovalPrompt).forEach(service => {
      const value = options.forceApprovalPrompt[service];
      if (service !== 'google')
        throw new Error("Accounts.ui.config: `forceApprovalPrompt` only supported for Google login at the moment.");

      if (Accounts.ui._options.forceApprovalPrompt[service]) {
        throw new Error(`Accounts.ui.config: Can't set \`forceApprovalPrompt\` more than once for ${service}`);
      } else {
        Accounts.ui._options.forceApprovalPrompt[service] = value;
      }
    });
  }
};

export const passwordSignupFields = () => {
  const { passwordSignupFields } = Accounts.ui._options;
  if (Array.isArray(passwordSignupFields)) {
    return passwordSignupFields;
  } else if (typeof passwordSignupFields === 'string') {
    return [passwordSignupFields];
  }
  return ["EMAIL_ONLY"];
}
  