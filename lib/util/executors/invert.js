const { difference } = require('./sets');

module.exports = function invert(executors) {
  return difference(new Set(['browser', 'server', 'cordova']), executors);
};
