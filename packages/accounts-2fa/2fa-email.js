import { Accounts } from 'meteor/accounts-base';
import { Email } from 'meteor/email';
import { Meteor } from 'meteor/meteor';
import crypto from 'crypto';

const EMAIL_CODE_LENGTH = 6;

const DEFAULT_EMAIL_CONFIG = {
  enabled: false,
  expirationMs: 10 * 60 * 1000,
  maxAttempts: 5,
  resendCooldownMs: 60 * 1000,
  requireVerified: true,
  offerToOtpUsers: false,
};

let emailConfig = { ...DEFAULT_EMAIL_CONFIG };
let warnedMissingHashSecret = false;

const defaultTemplate = {
  subject() {
    return `Your verification code for ${Accounts.emailTemplates.siteName || 'your account'}`;
  },
  text(user, url, extra = {}) {
    return `Your verification code is ${extra.code}. It expires shortly. If you did not try to sign in, you can ignore this message.`;
  },
};

/**
 * @summary Merge email-factor options from `Accounts.configure2fa`.
 * @locus Server
 * @param {Object} options
 */
Accounts._configure2faEmail = options => {
  emailConfig = { ...emailConfig, ...options };
  if (!emailConfig.hashSecret) {
    emailConfig.hashSecret = undefined;
  }
  if (
    emailConfig.enabled === true &&
    !emailConfig.hashSecret &&
    !warnedMissingHashSecret &&
    !Meteor.isPackageTest
  ) {
    warnedMissingHashSecret = true;
    console.warn(
      'accounts-2fa: email codes are hashed without a server secret. Pass email.hashSecret to Accounts.configure2fa.'
    );
  }
};

Accounts._is2faEmailEnabled = () => emailConfig.enabled === true;

Accounts._2faEmailOffersToOtpUsers = () => emailConfig.offerToOtpUsers === true;

const usableEmail = user => {
  const emails = user?.emails || [];
  if (emailConfig.requireVerified) {
    return emails.find(email => email?.address && email.verified)?.address || null;
  }
  return emails.find(email => email?.address)?.address || null;
};

/** An email factor exists only when the factor is enabled and the user has a usable address. */
Accounts._2faEmailAvailable = user =>
  emailConfig.enabled === true && !!usableEmail(user);

const hashCode = (userId, code) => {
  const payload = `${userId}:${code}`;
  if (emailConfig.hashSecret) {
    return crypto.createHmac('sha256', emailConfig.hashSecret).update(payload).digest('hex');
  }
  return crypto.createHash('sha256').update(payload).digest('hex');
};

const randomCode = () => {
  const max = 10 ** EMAIL_CODE_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(EMAIL_CODE_LENGTH, '0');
};

const ensureTemplate = () => {
  if (!Accounts.emailTemplates) {
    Accounts.emailTemplates = {};
  }
  if (!Accounts.emailTemplates.twoFactorCode) {
    Accounts.emailTemplates.twoFactorCode = defaultTemplate;
  }
};

/**
 * Send a new code, or keep the current one when the resend cooldown has not elapsed.
 * @returns {Promise<{sent: boolean, retryAfterMs: number}>}
 */
Accounts._issue2faEmailCode = async user => {
  const address = usableEmail(user);
  if (!address) {
    return { sent: false, retryAfterMs: 0 };
  }

  const current = user.services?.twoFactorAuthentication?.emailCode;
  const now = Date.now();
  if (current?.createdAt instanceof Date) {
    const age = now - current.createdAt.getTime();
    // A spent code keeps createdAt. The cooldown still applies after the attempts are used up.
    const exhausted = !current.hash || current.attempts >= emailConfig.maxAttempts;
    const stillValid = !exhausted && age < emailConfig.expirationMs;
    if (age < emailConfig.resendCooldownMs && (stillValid || exhausted)) {
      return {
        sent: false,
        retryAfterMs: emailConfig.resendCooldownMs - age,
      };
    }
  }

  const code = randomCode();
  const issuedAt = new Date();
  // The in-memory check above is not a lock: parallel logins each hold their own
  // user document. Only one update can match, so only one email is sent.
  const claimed = await Meteor.users.updateAsync(
    {
      _id: user._id,
      $or: [
        { 'services.twoFactorAuthentication.emailCode.createdAt': { $exists: false } },
        {
          'services.twoFactorAuthentication.emailCode.createdAt': {
            $lte: new Date(issuedAt.getTime() - emailConfig.resendCooldownMs),
          },
        },
        {
          'services.twoFactorAuthentication.emailCode.hash': { $exists: true },
          'services.twoFactorAuthentication.emailCode.attempts': { $lt: emailConfig.maxAttempts },
          'services.twoFactorAuthentication.emailCode.createdAt': {
            $lte: new Date(issuedAt.getTime() - emailConfig.expirationMs),
          },
        },
      ],
    },
    {
      $set: {
        'services.twoFactorAuthentication.emailCode': {
          hash: hashCode(user._id, code),
          createdAt: issuedAt,
          attempts: 0,
          email: address,
        },
      },
    }
  );
  if (!claimed) {
    const fresh = await Meteor.users.findOneAsync(user._id, {
      fields: { 'services.twoFactorAuthentication.emailCode.createdAt': 1 },
    });
    const createdAt = fresh?.services?.twoFactorAuthentication?.emailCode?.createdAt;
    const age = createdAt instanceof Date ? Date.now() - createdAt.getTime() : 0;
    return {
      sent: false,
      retryAfterMs: Math.max(emailConfig.resendCooldownMs - age, 0),
    };
  }

  if (Meteor.isPackageTest) {
    Accounts._2faTestState = { ...(Accounts._2faTestState || {}), lastEmailCode: code };
  }

  ensureTemplate();
  try {
    const options = await Accounts.generateOptionsForEmail(
      address,
      user,
      Meteor.absoluteUrl(),
      'twoFactorCode',
      { code }
    );
    await Email.sendAsync(options);
  } catch (error) {
    // The user received nothing, so the cooldown must not block the next request.
    await Meteor.users.updateAsync(
      {
        _id: user._id,
        'services.twoFactorAuthentication.emailCode.createdAt': issuedAt,
      },
      { $unset: { 'services.twoFactorAuthentication.emailCode': 1 } }
    );
    console.error('accounts-2fa: failed to send the email code', error);
    throw new Meteor.Error(
      '2fa-email-failed',
      'The verification code could not be sent'
    );
  }

  return { sent: true, retryAfterMs: 0 };
};

const MAX_2FA_CODE_LENGTH = 16;

const codesMatch = (userId, code, hash) => {
  if (typeof code !== 'string' || code.length > MAX_2FA_CODE_LENGTH || typeof hash !== 'string') {
    return false;
  }
  const actual = hashCode(userId, code.trim());
  const left = Buffer.from(actual);
  const right = Buffer.from(hash);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
};

/**
 * Check a pending email code and delete it on success.
 * A wrong code consumes one attempt.
 * @returns {Promise<boolean>}
 */
Accounts._verify2faEmailCode = async (user, code) => {
  const record = user.services?.twoFactorAuthentication?.emailCode;
  if (!record?.hash || !(record.createdAt instanceof Date)) {
    return false;
  }

  const expired = Date.now() - record.createdAt.getTime() >= emailConfig.expirationMs;
  if (expired) {
    // Match the hash that was checked, so a code issued since then is left in place.
    await Meteor.users.updateAsync(
      {
        _id: user._id,
        'services.twoFactorAuthentication.emailCode.hash': record.hash,
      },
      { $unset: { 'services.twoFactorAuthentication.emailCode': 1 } }
    );
    return false;
  }
  if (record.attempts >= emailConfig.maxAttempts) {
    return false;
  }

  if (!codesMatch(user._id, code, record.hash)) {
    // The last failure drops the hash so the code cannot be retried, and keeps
    // createdAt so the resend cooldown still applies.
    const updated = await Meteor.users.updateAsync(
      {
        _id: user._id,
        'services.twoFactorAuthentication.emailCode.hash': record.hash,
        'services.twoFactorAuthentication.emailCode.attempts': {
          $lt: Math.max(emailConfig.maxAttempts - 1, 0),
        },
      },
      { $inc: { 'services.twoFactorAuthentication.emailCode.attempts': 1 } }
    );
    if (!updated) {
      await Meteor.users.updateAsync(
        {
          _id: user._id,
          'services.twoFactorAuthentication.emailCode.hash': record.hash,
        },
        {
          $set: {
            'services.twoFactorAuthentication.emailCode.attempts': emailConfig.maxAttempts,
          },
          $unset: { 'services.twoFactorAuthentication.emailCode.hash': 1 },
        }
      );
    }
    return false;
  }

  const consumed = await Meteor.users.updateAsync(
    {
      _id: user._id,
      'services.twoFactorAuthentication.emailCode.hash': record.hash,
    },
    { $unset: { 'services.twoFactorAuthentication.emailCode': 1 } }
  );
  return consumed > 0;
};
