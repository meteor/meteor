import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';
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

export const NonEmptyString = Match.Where(x => {
  check(x, String);
  return x.length > 0;
});

export const checkToken = ({
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
