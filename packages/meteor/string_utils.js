// Like Perl's quotemeta: quotes all regexp metacharacters.
// Code taken from
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
Meteor._escapeRegExp = function (string) {
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
