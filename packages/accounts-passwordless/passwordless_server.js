import { Accounts } from 'meteor/accounts-base';
import {
  getUserById,
  handleError,
  tokenValidator,
  userQueryValidator,
} from './server_utils';
import { Random } from 'meteor/random';


const checkForCaseInsensitiveDuplicates = (fieldName, displayName, fieldValue, ownUserId) => {
  // Some tests need the ability to add users with the same case insensitive
  // value, hence the _skipCaseInsensitiveChecksForTest check
  const skipCheck = Object.prototype.hasOwnProperty.call(Accounts._skipCaseInsensitiveChecksForTest, fieldValue);

  if (fieldValue && !skipCheck) {
    const matchedUsers = Meteor.users.find(
        Accounts._selectorForFastCaseInsensitiveLookup(fieldName, fieldValue),
        {
          fields: {_id: 1},
          // we only need a maximum of 2 users for the logic below to work
          limit: 2,
        }
    ).fetch();

    if (matchedUsers.length > 0 &&
        // If we don't have a userId yet, any match we find is a duplicate
        (!ownUserId ||
            // Otherwise, check to see if there are multiple matches or a match
            // that is not us
            (matchedUsers.length > 1 || matchedUsers[0]._id !== ownUserId))) {
      handleError(`${displayName} already exists.`);
    }
  }
};

const checkToken = ({ user }) => {
  const result = {
    userId: user._id,
  };

  const userStoredToken = user.services.passwordless;
  const { createdAt } = userStoredToken;

  if (
      new Date(
          createdAt.getTime() +
          Accounts._options.loginTokenExpirationHours * 60 * 60 * 1000
      ) >= new Date()
  ) {
    result.error = handleError('Expired token', false);
  }

  Meteor.users.update(user._id, {
    $unset:       {'services.passwordless':1},
  });

  return result;
};

// Handler to login with an ott.
Accounts.registerLoginHandler('passwordless', options => {
  if (!options.token) return undefined; // don't handle

  check(options, {
    token: tokenValidator(),
  });

  const user = Meteor.users.findOne({"services.passwordless.sequence": options.token}, {fields: {
      services: 1,
    },
  })
  if (!user) {
    handleError('User not found');
  }

  if (
    !user.services ||
    !user.services.passwordless
  ) {
    handleError('User has no token set');
  }

  return checkToken({ user });
});

// Utility for plucking addresses from emails
const pluckAddresses = (emails = []) => emails.map(email => email.address);
const createUser = (userObject) => {

  const { username, email } = userObject;
  if (!username && !email) {
    throw new Meteor.Error(400, "Need to set a username or email");
  }
  const user = {services: {}};
  if (username)
    user.username = username;
  if (email)
    user.emails = [{address: email, verified: false}];

  // Perform a case insensitive check before insert
  checkForCaseInsensitiveDuplicates('username', 'Username', username);
  checkForCaseInsensitiveDuplicates('emails.address', 'Email', email);

  const userId = Accounts.insertUserDoc(userObject, user);
  // Perform another check after insert, in case a matching user has been
  // inserted in the meantime
  try {
    checkForCaseInsensitiveDuplicates('username', 'Username', username, userId);
    checkForCaseInsensitiveDuplicates('emails.address', 'Email', email, userId);
  } catch (ex) {
    // Remove inserted user if the check fails
    Meteor.users.remove(userId);
    throw ex;
  }
  return userId;
}
Meteor.methods({
  requestLoginTokenForUser: ({ selector, userObject }) => {
    let user = Accounts._findUserByQuery(selector, {
      fields: { emails: 1 },
    });

    if (!user && !userObject) {
      handleError('User not found');
    }
    if (!user) {
      createUser(userObject);
      user = Accounts._findUserByQuery(selector, {
        fields: { emails: 1 },
      });
    }

    if (!user) {
      handleError('User could not be created');
    }

    const sequence = Random.hexString(
      Accounts._options.tokenSequenceLength || 6
    ).toUpperCase();
    Meteor.users.update(user._id, {
      $set: {
        'services.passwordless': {
          createdAt: new Date(),
          sequence,
        },
      },
    });
    const shouldContinue = Accounts._onCreateLoginTokenHook ? Accounts._onCreateLoginTokenHook({
      token: sequence,
      userId: user._id,
    }) : true;

    const emails = pluckAddresses(user.emails);

    if (shouldContinue) {
      emails.forEach(email => {
        Accounts.sendLoginTokenEmail({ userId: user._id, sequence, email });
      });
    }
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
    {sequence}
  );
  Email.send(options);
  if (Meteor.isDevelopment) {
    console.log(`\nLogin Token url: ${url}`);
  }
  return { email, user, token: sequence, url, options };
};
