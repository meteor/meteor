import {Accounts} from "meteor/accounts-base";

export const getUserById = (id, options) => Meteor.users.findOne(id, Accounts._addDefaultFieldSelector(options));

export const handleError = (msg, throwError = true) => {
    const error = new Meteor.Error(
        403,
        Accounts._options.ambiguousErrorMessages
            ? "Something went wrong. Please check your credentials."
            : msg
    );
    if (throwError) {
        throw error;
    }
    return error;
};
export const NonEmptyString = Match.Where(x => {
    check(x, String);
    return x.length > 0;
});

export const userQueryValidator = Match.Where(user => {
    check(user, {
        id: Match.Optional(NonEmptyString),
        username: Match.Optional(NonEmptyString),
        email: Match.Optional(NonEmptyString),
    });
    if (Object.keys(user).length !== 1)
        throw new Match.Error('User property must have exactly one field');
    return true;
});
export const tokenValidator = () => {
    const tokenLength = Accounts._options.tokenLength || 6;
    return Match.Where(
        str => Match.test(str, String) && str.length <= tokenLength
    );
};
