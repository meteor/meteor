import { Accounts } from 'meteor/accounts-base';
import {
  DEFAULT_TOKEN_SEQUENCE_LENGTH,
  getUserById,
  NonEmptyString,
  tokenValidator,
  checkToken,
} from './server_utils';
import { Random } from 'meteor/random';

const findUserWithOptions = ({ selector }) => {
  if (!selector) {
    Accounts._handleError('A selector is necessary');
  }
  const { email, id, ...rest } = selector;
  return Meteor.users.findOne(
    {
      ...rest,
      ...(id && { _id: id }),
      ...(email && { 'emails.address': email })
    },
    {
      fields: {
        services: 1,
        emails: 1,
      },
    }
  );
};
// Handler to login with an ott.
Accounts.registerLoginHandler('passwordless', options => {
  if (!options.token) return undefined; // don't handle

  check(options, {
    token: tokenValidator(),
    code: Match.Optional(NonEmptyString),
    selector: Accounts._userQueryValidator,
  });

  const sequence = options.token.toUpperCase();
  const { selector } = options;

  const user = findUserWithOptions(options);

  if (!user) {
    Accounts._handleError('User not found');
  }

  if (!user.services || !user.services.passwordless) {
    Accounts._handleError('User has no token set');
  }

  const result = checkToken({
    user,
    selector,
    sequence,
  });
  const { verifiedEmail, error } = result;

  if (!error && verifiedEmail) {
    // This method is added by the package accounts-2fa
    if (Accounts._check2faEnabled?.(user)) {
      if (!options.code) {
        Accounts._handleError('2FA code must be informed', true, 'no-2fa-code');
        return;
      }
      if (
        !Accounts._isTokenValid(
          user.services.twoFactorAuthentication.secret,
          options.code
        )
      ) {
        Accounts._handleError('Invalid 2FA code', true, 'invalid-2fa-code');
        return;
      }
    }
    // It's necessary to make sure we don't remove the token if the user has 2fa enabled
    // otherwise, it would be necessary to generate a new one if this method is called without
    // a 2fa code
    Meteor.users.update(
      { _id: user._id, 'emails.address': verifiedEmail },
      {
        $set: {
          'emails.$.verified': true,
        },
        $unset: { 'services.passwordless': 1 },
      }
    );
  }

  return result;
});

// Utility for plucking addresses from emails
const pluckAddresses = (emails = []) => emails.map(email => email.address);
const createUser = userData => {
  const { username, email } = userData;
  if (!username && !email) {
    throw new Meteor.Error(400, 'Need to set a username or email');
  }
  const user = { services: {} };
  return Accounts._createUserCheckingDuplicates({
    user,
    username,
    email,
    options: userData,
  });
};

function generateSequence() {
  return Random.hexString(
    Accounts._options.tokenSequenceLength || DEFAULT_TOKEN_SEQUENCE_LENGTH
  ).toUpperCase();
}

Meteor.methods({
  requestLoginTokenForUser: ({ selector, userData, options = {} }) => {
    let user = Accounts._findUserByQuery(selector, {
      fields: { emails: 1 },
    });

    if (
      !user &&
      (options.userCreationDisabled ||
        Accounts._options.forbidClientAccountCreation)
    ) {
      Accounts._handleError('User not found');
    }

    // useful to customize messages
    const isNewUser = !user;

    if (!user) {
      const userId = createUser(userData);
      user = Accounts._findUserByQuery(
        { id: userId },
        {
          fields: { emails: 1 },
        }
      );
    }

    if (!user) {
      Accounts._handleError('User could not be created');
    }

    const result = {
      selector,
      userData,
      isNewUser,
    };

    const emails = pluckAddresses(user.emails);
    const userSequence = generateSequence();

    const tokens = emails
      .map(email => {
        // if the email was informed we will notify only this email
        if (
          selector.email &&
          selector.email.toLowerCase() !== email.toLowerCase()
        ) {
          return null;
        }
        const sequence = generateSequence();
        return { email, sequence };
      })
      .filter(Boolean);

    if (!tokens.length) {
      Accounts._handleError(`Login tokens could not be generated`);
    }

    Meteor.users.update(user._id, {
      $set: {
        'services.passwordless': {
          createdAt: new Date(),
          token: SHA256(user._id + userSequence),
          tokens: tokens.map(({ email, sequence }) => ({
            email,
            token: SHA256(email + sequence),
          })),
          ...(isNewUser ? { isNewUser } : {}),
        },
      },
    });

    const shouldSendLoginTokenEmail = Accounts._onCreateLoginTokenHook
      ? Accounts._onCreateLoginTokenHook({
          token: userSequence,
          userId: user._id,
        })
      : true;

    if (shouldSendLoginTokenEmail) {
      tokens.forEach(({ email, sequence }) => {
        Accounts.sendLoginTokenEmail({
          userId: user._id,
          sequence,
          email,
          ...(options.extra ? { extra: options.extra } : {}),
        });
      });
    }

    return result;
  },
});

/**
 * @summary Send an email with a link the user can use to login with token.
 * @locus Server
 * @param {Object} options
 * @param {String} options.userId The id of the user to send email to.
 * @param {String} options.sequence The token to be provided
 * @param {String} options.email Which address of the user's to send the email to.
 * @param {Object} options.extra Optional. Extra properties
 * @returns {Object} Object with {email, user, token, url, options} values.
 */
Accounts.sendLoginTokenEmail = ({ userId, sequence, email, extra = {} }) => {
  const user = getUserById(userId);
  const url = Accounts.urls.loginToken(email, sequence);
  const options = Accounts.generateOptionsForEmail(
    email,
    user,
    url,
    'sendLoginToken',
    { ...extra, sequence }
  );
  Email.send({ ...options, extra });
  if (Meteor.isDevelopment) {
    console.log(`\nLogin Token url: ${url}`);
  }
  return { email, user, token: sequence, url, options };
};

const setupUsersCollection = () => {
  Meteor.users.createIndexAsync('services.passwordless.tokens.token', {
    unique: true,
    sparse: true,
  });
  Meteor.users.createIndexAsync('services.passwordless.token', {
    unique: true,
    sparse: true,
  });
};

Meteor.startup(() => setupUsersCollection());
