import { Accounts } from 'meteor/accounts-base';
import { getUserById, tokenValidator } from './server_utils';
import { Random } from 'meteor/random';

const ONE_HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

const checkToken = ({ user }) => {
  const result = {
    userId: user._id,
  };

  const userStoredToken = user.services.passwordless;
  const { createdAt } = userStoredToken;

  if (
    new Date(
      createdAt.getTime() +
        Accounts._options.loginTokenExpirationHours * ONE_HOUR_IN_MILLISECONDS
    ) >= new Date()
  ) {
    result.error = Accounts._handleError('Expired token', false);
  }

  return result;
};

// Handler to login with an ott.
Accounts.registerLoginHandler('passwordless', options => {
  if (!options.token) return undefined; // don't handle

  check(options, {
    token: tokenValidator(),
  });

  const sequence = options.token.toUpperCase();
  const user = Meteor.users.findOne(
    { 'services.passwordless.tokens.sequence': sequence },
    {
      fields: {
        services: 1,
        emails: 1,
      },
    }
  );
  if (!user) {
    Accounts._handleError('User not found');
  }

  if (!user.services || !user.services.passwordless) {
    Accounts._handleError('User has no token set');
  }

  const result = checkToken({ user });

  if (!result.error) {
    const verifiedEmail = user.services.passwordless.tokens.find(
      token => token.sequence === sequence
    ).email;
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

Meteor.methods({
  requestLoginTokenForUser: ({ selector, userObject, options = {} }) => {
    let user = Accounts._findUserByQuery(selector, {
      fields: { emails: 1 },
    });

    // TODO [accounts-passwordless] document userCreationDisabled
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
    const tokens = emails.map(email => {
      const sequence = Random.hexString(
        Accounts._options.tokenSequenceLength || 6
      ).toUpperCase();
      return { email, sequence };
    });
    Meteor.users.update(user._id, {
      $set: {
        'services.passwordless': {
          createdAt: new Date(),
          tokens,
          ...(isNewUser ? { isNewUser } : {}),
        },
      },
    });

    const shouldSendLoginTokenEmail = Accounts._onCreateLoginTokenHook
      ? Accounts._onCreateLoginTokenHook({
          tokens,
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
  const url = Accounts.urls.loginToken(sequence);
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
  Meteor.users.createIndex('services.passwordless.tokens.sequence', {
    unique: true,
    sparse: true,
  });
};

Meteor.startup(() => setupUsersCollection());
