Meteor.fibersDisabled = true;

Meteor._isPromise = (r) => {
    return r && typeof r.then === 'function';
};
