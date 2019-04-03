/**
 * @summary Accounts UI
 * @namespace
 * @memberOf Accounts
 * @importFromPackage accounts-base
 */
Accounts.ui = {
  _options: {
    requestPermissions: Object.create(null),
    requestOfflineToken: Object.create(null),
    forceApprovalPrompt: Object.create(null),
  },
};

const VALID_OPTIONS = new Set()
  .add('passwordSignupFields')
  .add('requestPermissions')
  .add('requestOfflineToken')
  .add('forceApprovalPrompt');

const VALID_PASSWORD_SIGNUP_FIELDS = new Set()
  .add("USERNAME_AND_EMAIL")
  .add("USERNAME_AND_OPTIONAL_EMAIL")
  .add("USERNAME_ONLY")
  .add("EMAIL_ONLY");

function isValidPasswordSignupField(field) {
  return VALID_PASSWORD_SIGNUP_FIELDS.has(field);
}

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
  Object.keys(options).forEach(key => {
    if (!VALID_OPTIONS.has(key)) {
      throw new Error(`Accounts.ui.config: Invalid option: ${key}`);
    }
  });

  handlePasswordSignupFields(options);
  handleRequestPermissions(options);
  handleRequestOfflineToken(options);
  handleForceApprovalPrompt(options);
};

function handlePasswordSignupFields(options) {
  let { passwordSignupFields } = options;

  if (passwordSignupFields) {
    const reportInvalid = () => {
      throw new Error(`Accounts.ui.config: Invalid option for \`passwordSignupFields\`: ${passwordSignupFields}`);
    };

    if (typeof passwordSignupFields === "string") {
      passwordSignupFields = [passwordSignupFields];
    } else if (!Array.isArray(passwordSignupFields)) {
      reportInvalid();
    }

    if (passwordSignupFields.every(isValidPasswordSignupField)) {
      if (Accounts.ui._options.passwordSignupFields) {
        throw new Error("Accounts.ui.config: Can't set `passwordSignupFields` more than once");
      }
      Object.assign(Accounts.ui._options, { passwordSignupFields });
      return;
    }

    reportInvalid();
  }
}

export function passwordSignupFields() {
  const { passwordSignupFields } = Accounts.ui._options;

  if (Array.isArray(passwordSignupFields)) {
    return passwordSignupFields;
  }

  if (typeof passwordSignupFields === 'string') {
    return [passwordSignupFields];
  }

  return ["EMAIL_ONLY"];
}


function handleRequestPermissions({ requestPermissions }) {
  if (requestPermissions) {
    Object.keys(requestPermissions).forEach(service => {
      if (Accounts.ui._options.requestPermissions[service]) {
        throw new Error(`Accounts.ui.config: Can't set \`requestPermissions\` more than once for ${service}`);
      }

      const scope = requestPermissions[service];

      if (!Array.isArray(scope)) {
        throw new Error("Accounts.ui.config: Value for `requestPermissions` must be an array");
      }

      Accounts.ui._options.requestPermissions[service] = scope;
    });
  }
}

function handleRequestOfflineToken({ requestOfflineToken }) {
  if (requestOfflineToken) {
    Object.keys(requestOfflineToken).forEach(service => {
      if (service !== 'google') {
        throw new Error("Accounts.ui.config: `requestOfflineToken` only supported for Google login at the moment.");
      }

      if (Accounts.ui._options.requestOfflineToken[service]) {
        throw new Error(`Accounts.ui.config: Can't set \`requestOfflineToken\` more than once for ${service}`);
      }

      Accounts.ui._options.requestOfflineToken[service] =
        requestOfflineToken[service];
    });
  }
}

function handleForceApprovalPrompt({ forceApprovalPrompt }) {
  if (forceApprovalPrompt) {
    Object.keys(forceApprovalPrompt).forEach(service => {
      if (service !== 'google') {
        throw new Error("Accounts.ui.config: `forceApprovalPrompt` only supported for Google login at the moment.");
      }

      if (Accounts.ui._options.forceApprovalPrompt[service]) {
        throw new Error(`Accounts.ui.config: Can't set \`forceApprovalPrompt\` more than once for ${service}`);
      }

      Accounts.ui._options.forceApprovalPrompt[service] =
        forceApprovalPrompt[service];
    });
  }
}
