import { Accounts } from 'meteor/accounts-base';
import {
  getUserById,
  handleError,
  tokenValidator,
  userQueryValidator,
} from './server_utils';
import { Random } from 'meteor/random';

Accounts.constructor.prototype._onCreateLoginTokenHook = () => true;

Accounts.constructor.prototype.Accounts._checkToken = ({ user, token }) => {
  const result = {
    userId: user._id,
  };

  const userStoredToken = user.services.passwordless.token;
  const { createdAt, sequence } = userStoredToken;

  if (
    new Date(
      createdAt.getTime() +
        Accounts._options.loginTokenExpirationHours * 60 * 60 * 1000
    ) >= new Date()
  ) {
    result.error = handleError('Expired token', false);
  }
  if (sequence !== token) {
    result.error = handleError('Sequence not found', false);
  }

  return result;
};
const checkToken = Accounts._checkToken;

// Handler to login with an ott.
Accounts.registerLoginHandler('passwordless', options => {
  if (!options.token) return undefined; // don't handle

  check(options, {
    user: userQueryValidator,
    token: tokenValidator(),
  });

  const user = Accounts._findUserByQuery(options.user, {
    fields: {
      services: 1,
    },
  });
  if (!user) {
    handleError('User not found');
  }

  if (
    !user.services ||
    !user.services.passwordless ||
    !user.services.passwordless.token
  ) {
    handleError('User has no token set');
  }

  return checkToken({ ...options, user });
});

// Utility for plucking addresses from emails
const pluckAddresses = (emails = []) => emails.map(email => email.address);

Meteor.methods({
  requestLoginTokenForUser: ({ selector, userObject }) => {
    let user = Accounts._findUserByQuery(selector, {
      fields: { emails: 1 },
    });

    if (!user && !userObject) {
      handleError('User not found');
    }
    if (!user) {
      Accounts.createUser(userObject);
      user = Accounts._findUserByQuery(selector, {
        fields: { emails: 1 },
      });
    }

    if (!user) {
      handleError('User could not be created');
    }

    const sequence = Random.hexString(
      Accounts._options.tokenSequenceLength || 6
    );
    Meteor.users.update({
      $set: {
        'services.passwordless': {
          createdAt: new Date(),
          sequence,
        },
      },
    });
    const shouldContinue = Accounts._onCreateLoginTokenHook({
      token: sequence,
      userId: user._id,
    });

    const emails = pluckAddresses(user.emails);

    if (shouldContinue) {
      for (const email of emails) {
        Accounts.sendLoginTokenEmail({ userId: user._id, sequence, email });
      }
    }
  },
});

/**
 * @summary Send an email with a link the user can use to reset their password.
 * @locus Server
 * @param {String} userId The id of the user to send email to.
 * @param {String} [email] Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first email in the list.
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendLoginTokenEmail = ({ userId, sequence, email }) => {
  const user = getUserById(userId);
  const url = Accounts.urls.loginToken(token, extraParams);
  const options = Accounts.generateOptionsForEmail(
    email,
    user,
    url,
    'sendLoginToken'
  );
  Email.send(options);
  if (Meteor.isDevelopment) {
    console.log(`\nLogin Token url: ${url}`);
  }
  return { email, user, token: sequence, url, options };
};
