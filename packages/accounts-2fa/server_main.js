import CryptoJS from 'crypto-js';
import { twoFACollection } from './collection';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check } from 'meteor/check';

Accounts.emailTemplates = {
  ...(Accounts.emailTemplates || {}),
  twoFACode: {
    subject: () =>
      `Your verification code for ${Accounts.emailTemplates.siteName}`,
    text: (user, code) => {
      const greet =
        user.profile && user.profile.name
          ? `Hello ${user.profile.name},`
          : 'Hello,';

      return `${greet}

Your requested code for ${Accounts.emailTemplates.siteName} sign-in is:

${code}

Thank you.
      `;
    },
  },
};

const BACKUP_CODE_SIZE =
  Meteor.settings.packages?.['accounts-2fa']?.backupCodeSize || 6;
const NEW_CODES_AMOUNT =
  Meteor.settings.packages?.['accounts-2fa']?.newCodesSize ||
  Meteor.settings.packages?.['accounts-2fa']?.backupCodeSize ||
  6;

const getCode = () => {
  let backupCode = '';
  for (let i = 0; i < BACKUP_CODE_SIZE; i++) {
    backupCode += Math.floor(Math.random() * 10);
  }
  return backupCode;
};

const codeToHash = code => CryptoJS.SHA256(code).toString(CryptoJS.enc.Base64);

const getCodeAndHashCode = () => {
  const code = getCode();
  return {
    code,
    hash: codeToHash(code),
  };
};

/**
 * Generate new code for user
 * @param userId {string}
 * @param isBackup {boolean}
 * @param expiredAt {Date}
 * @returns {string}
 */
const generateNewCode = ({ userId, isBackup = false, expiredAt }) => {
  const { code, hash } = getCodeAndHashCode();
  twoFACollection.insert({
    userId,
    code: hash,
    isBackup,
    createdAt: new Date(),
    expiredAt,
  });
  return code;
};

export let twoFactorSignInOverrideHook = undefined;

/**
 *
 * @param email {string}
 */
export const generateSignInCode = email => {
  check(email, String);
  const user = Accounts.findUserByEmail(email);
  const userId = user._id;
  twoFACollection.remove({ userId, isBackup: false });

  const expiredAt = new Date(
    new Date().getTime() +
      Meteor.settings.packages?.['accounts-2fa']?.signInCodeExpiresIn || 600000 // 10 minutes by default
  );

  const code = generateNewCode({ userId, expiredAt });

  if (twoFactorSignInOverrideHook)
    return twoFactorSignInOverrideHook(userId, code);

  // Continue with sending the code via e-mail
};

/**
 * Checks an entered code and discard it if correct.
 * @param userId {string}
 * @param userCode {string}
 * @returns {{error: string}|{isValid: boolean}}
 */
export const checkAndDiscardCode = (userId, userCode) => {
  if (!userCode) {
    return { error: 'No code provided' };
  }
  const savedCode = twoFACollection.findOne({
    userId,
    code: codeToHash(userCode),
  });

  if (!savedCode) return { error: 'Invalid code' };

  const now = new Date();
  const { expiredAt } = savedCode;

  if (expiredAt && expiredAt.getTime() < now.getTime()) {
    return { error: 'Expired code' };
  }

  twoFACollection.remove(savedCode._id);
  return { isValid: true };
};

/**
 * Generates backup codes for user
 * @param userId {string}
 * @returns {string[]}
 */
export const generateNewBackupCodes = userId => {
  const codes = [];
  for (let i = 0; i < NEW_CODES_AMOUNT; i++) {
    codes.push(generateNewCode({ userId, isBackup: true }));
  }
  return codes;
};

/**
 * Removes backup codes for the given user
 * @param userId {string}
 * @returns number
 */
export const cleanBackupCodes = userId => {
  return twoFACollection.remove({ userId, isBackup: true });
};

/**
 *
 * @param userId {string}
 * @returns {string[]}
 */
export const cleanAndGenerateNewBackupCodes = userId => {
  cleanBackupCodes(userId);
  return generateNewBackupCodes(userId);
};

export { twoFACollection };
