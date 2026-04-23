import { Accounts } from 'meteor/accounts-base';
import { Match } from 'meteor/check';
import { SHA256 } from 'meteor/sha';

const ONE_HOUR_IN_MILLISECONDS = 60 * 60 * 1000;
export const DEFAULT_TOKEN_SEQUENCE_LENGTH = 6;

export const getUserById = async (id, options) =>
    Meteor.users.findOneAsync(id, Accounts._addDefaultFieldSelector(options));

export const tokenValidator = () => {
  const tokenLength =
    Accounts._options.tokenSequenceLength || DEFAULT_TOKEN_SEQUENCE_LENGTH;
  return Match.Where(
    str => Match.test(str, String) && str.length <= tokenLength
  );
};

export const checkToken = async ({
  user,
  sequence,
  selector,
  currentDate = new Date(),
}) => {
  const result = {
    userId: user._id,
  };

  const { createdAt, token: userToken } = user.services.passwordless;

  const { loginTokenExpirationHours = 1 } = Accounts._options || {};

  const expirationDate = new Date(
    createdAt.getTime() + loginTokenExpirationHours * ONE_HOUR_IN_MILLISECONDS
  );

  if (expirationDate <= currentDate) {
    result.error = Accounts._handleError('Expired token', false);
  }

  if (selector.email) {
    for (const { email: tokenEmail, token } of user.services.passwordless.tokens) {
      if (
        await SHA256(selector.email + sequence) === token &&
        selector.email === tokenEmail
      ) {
        return { ...result, verifiedEmail: tokenEmail };
      }
    }

    result.error = Accounts._handleError('Email or token mismatch', false);
    return result;
  }

  if (sequence && await SHA256(user._id + sequence) === userToken) {
    return result;
  }

  result.error = Accounts._handleError('Token mismatch', false);

  return result;
};
