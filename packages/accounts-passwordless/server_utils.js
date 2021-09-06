import { Accounts } from 'meteor/accounts-base';

export const getUserById = (id, options) =>
  Meteor.users.findOne(id, Accounts._addDefaultFieldSelector(options));

export const tokenValidator = () => {
  const tokenLength = Accounts._options.tokenLength || 6;
  return Match.Where(
    str => Match.test(str, String) && str.length <= tokenLength
  );
};
export const userQueryValidator = Match.Where(user => {
  check(user, {
    id: Match.Optional(NonEmptyString),
    username: Match.Optional(NonEmptyString),
    email: Match.Optional(NonEmptyString)
  });
  if (Object.keys(user).length !== 1)
    throw new Match.Error("User property must have exactly one field");
  return true;
});
