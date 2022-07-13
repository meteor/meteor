import { Accounts } from 'meteor/accounts-base';

export const DEFAULT_TOKEN_SEQUENCE_LENGTH = 6;

export const getUserById = (id, options) =>
  Meteor.users.findOne(id, Accounts._addDefaultFieldSelector(options));

export const tokenValidator = () => {
  const tokenLength = Accounts._options.tokenSequenceLength || DEFAULT_TOKEN_SEQUENCE_LENGTH;
  return Match.Where(
    str => Match.test(str, String) && str.length <= tokenLength
  );
};

export const NonEmptyString = Match.Where(x => {
  check(x, String);
  return x.length > 0;
});
