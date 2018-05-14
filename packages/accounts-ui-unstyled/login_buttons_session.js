const VALID_KEYS = [
  'dropdownVisible',

  // XXX consider replacing these with one key that has an enum for values.
  'inSignupFlow',
  'inForgotPasswordFlow',
  'inChangePasswordFlow',
  'inMessageOnlyFlow',

  'errorMessage',
  'infoMessage',

  // dialogs with messages (info and error)
  'resetPasswordToken',
  'enrollAccountToken',
  'justVerifiedEmail',
  'justResetPassword',

  'configureLoginServiceDialogVisible',
  'configureLoginServiceDialogServiceName',
  'configureLoginServiceDialogSaveDisabled',
  'configureOnDesktopVisible',
];

const validateKey = key => {
  if (!VALID_KEYS.includes(key))
    throw new Error(`Invalid key in loginButtonsSession: ${key}`);
};

const KEY_PREFIX = "Meteor.loginButtons.";

// XXX This should probably be package scope rather than exported
// (there was even a comment to that effect here from before we had
// namespacing) but accounts-ui-viewer uses it, so leave it as is for
// now
const set = (key, value) => {
  validateKey(key);
  if (['errorMessage', 'infoMessage'].includes(key))
    throw new Error("Don't set errorMessage or infoMessage directly. Instead, use errorMessage() or infoMessage().");

  _set(key, value);
};

const _set = (key, value) => Session.set(KEY_PREFIX + key, value);

const get = key => {
  validateKey(key);
  return Session.get(KEY_PREFIX + key);
};

const closeDropdown = () => {
  set('inSignupFlow', false);
  set('inForgotPasswordFlow', false);
  set('inChangePasswordFlow', false);
  set('inMessageOnlyFlow', false);
  set('dropdownVisible', false);
  resetMessages();
};

const infoMessage = message => {
  _set("errorMessage", null);
  _set("infoMessage", message);
  ensureMessageVisible();
};

const errorMessage = message => {
  _set("errorMessage", message);
  _set("infoMessage", null);
  ensureMessageVisible();
};

// is there a visible dialog that shows messages (info and error)
const isMessageDialogVisible = () => {
  return get('resetPasswordToken') ||
    get('enrollAccountToken') ||
    get('justVerifiedEmail');
};

// ensure that somethings displaying a message (info or error) is
// visible. If a dialog with messages is open, do nothing;
// otherwise open the dropdown.
//
// Notably this doesn't matter when only displaying a single login
// button since then we have an explicit message dialog
// (_loginButtonsMessageDialog), and dropdownVisible is ignored in
// this case.
const ensureMessageVisible = () => {
  if (!isMessageDialogVisible())
    set("dropdownVisible", true);
};

const resetMessages = () => {
  _set("errorMessage", null);
  _set("infoMessage", null);
};

const configureService = name => {
  if (Meteor.isCordova) {
    set('configureOnDesktopVisible', true);
  } else {
    set('configureLoginServiceDialogVisible', true);
    set('configureLoginServiceDialogServiceName', name);
    set('configureLoginServiceDialogSaveDisabled', true);
  }
};

Accounts._loginButtonsSession = {
  set,
  _set,
  get,
  closeDropdown,
  infoMessage,
  errorMessage,
  isMessageDialogVisible,
  ensureMessageVisible,
  resetMessages,
  configureService,
};
