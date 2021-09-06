import { Accounts } from 'meteor/accounts-base';

export const getUserById = (id, options) =>
  Meteor.users.findOne(id, Accounts._addDefaultFieldSelector(options));

export const tokenValidator = () => {
  const tokenLength = Accounts._options.tokenLength || 6;
  return Match.Where(
    str => Match.test(str, String) && str.length <= tokenLength
  );
};
