const getAslStore = () => (Meteor.isServer && global?.asyncLocalStorage?.getStore()) || {};
const getValueFromAslStore = key => getAslStore()[key];
const updateAslStore = (key, value) => getAslStore()[key] = value;

Meteor._isFibersEnabled = !process.env.DISABLE_FIBERS && Meteor.isServer;
Meteor._getAslStore = getAslStore;
Meteor._getValueFromAslStore = getValueFromAslStore;
Meteor._updateAslStore = updateAslStore;
