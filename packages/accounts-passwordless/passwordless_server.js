import { Accounts } from 'meteor/accounts-base';
import { getUserById, tokenValidator } from './server_utils';
import { Random } from 'meteor/random';

const ONE_HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

const checkToken = ({ user, sequence, selector }) => {
  const result = {
    userId: user._id,
  };

  const { createdAt, token: userToken } = user.services.passwordless;

  if (
    new Date(
      createdAt.getTime() +
        Accounts._options.loginTokenExpirationHours * ONE_HOUR_IN_MILLISECONDS
    ) >= new Date()
  ) {
    result.error = Accounts._handleError('Expired token', false);
  }

  if (selector.email) {
    const foundTokenEmail = user.services.passwordless.tokens.find(
      ({ email: tokenEmail, token }) =>
        SHA256(selector.email + sequence) === token &&
        selector.email === tokenEmail
    );
    if (foundTokenEmail) {
      return { ...result, verifiedEmail: foundTokenEmail.email };
    }

    result.error = Accounts._handleError('Email or token mismatch', false);
    return result;
  }

  if (sequence && SHA256(user._id + sequence) === userToken) {
    return result;
  }

  result.error = Accounts._handleError('Token mismatch', false);

  return result;
};
const findUserWithOptions = ({ selector }) => {
  if (!selector) {
    Accounts._handleError('A selector is necessary');
  }
  const { email, ...rest } = selector;
  return Meteor.users.findOne(
    { ...rest, ...(email ? { 'emails.address': selector.email } : {}) },
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
const createUser = userObject => {
  const { username, email } = userObject;
  if (!username && !email) {
    throw new Meteor.Error(400, 'Need to set a username or email');
  }
  const user = { services: {} };
  return Accounts._createUserCheckingDuplicates({
    user,
    username,
    email,
    options: userObject,
  });
};

function generateSequence() {
  return Random.hexString(
    Accounts._options.tokenSequenceLength || 6
  ).toUpperCase();
}

Meteor.methods({
  requestLoginTokenForUser: ({ selector, userObject, options = {} }) => {
    let user = Accounts._findUserByQuery(selector, {
      fields: { emails: 1 },
    });

    if (!user && options.userCreationDisabled) {
      Accounts._handleError('User not found');
    }

    // useful to customize messages
    const isNewUser = !user;

    if (!user) {
      const userId = createUser(userObject);
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
      userObject,
      isNewUser,
    };

    const emails = pluckAddresses(user.emails);
    const userSequence = generateSequence();

    const tokens = emails.map(email => {
      const sequence = generateSequence();
      return { email, sequence };
    });
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
        });
      });
    }

    return result;
  },
});

/**
 * @summary Send an email with a link the user can use to reset their password.
 * @locus Server
 * @param {String} userId The id of the user to send email to.
 * @param sequence
 * @param {String} [email] Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first email in the list.
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendLoginTokenEmail = ({ userId, sequence, email }) => {
  const user = getUserById(userId);
  const url = Accounts.urls.loginToken(email, sequence);
  const options = Accounts.generateOptionsForEmail(
    email,
    user,
    url,
    'sendLoginToken',
    { sequence }
  );
  Email.send(options);
  if (Meteor.isDevelopment) {
    console.log(`\nLogin Token url: ${url}`);
  }
  return { email, user, token: sequence, url, options };
};

const setupUsersCollection = () => {
  Meteor.users.createIndex('services.passwordless.tokens.token', {
    unique: true,
    sparse: true,
  });
  Meteor.users.createIndex('services.passwordless.token', {
    unique: true,
    sparse: true,
  });
};

Meteor.startup(() => setupUsersCollection());
