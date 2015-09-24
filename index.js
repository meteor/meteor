'use strict';

module.exports = {
  rules: {
    'no-session': require('./lib/rules/no-session'),
    'no-blaze-lifecycle-assignment': require('./lib/rules/no-blaze-lifecycle-assignment')
  },
  rulesConfig: {
    'no-session': 0,
    'no-blaze-lifecycle-assignment': 0
  }
};
