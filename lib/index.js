module.exports = {
  rules: {
    'audit-argument-checks': require('./rules/audit-argument-checks'),
    'no-session': require('./rules/no-session'),
    'no-blaze-lifecycle-assignment': require('./rules/no-blaze-lifecycle-assignment'),
    'no-zero-timeout': require('./rules/no-zero-timeout'),
    'blaze-consistent-eventmap-params': require('./rules/blaze-consistent-eventmap-params'),
  },
  configs: {
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
    recommended: {
      rules: {
        'meteor/audit-argument-checks': 2,
        'meteor/no-session': 2,
        'meteor/no-blaze-lifecycle-assignment': 2,
        'meteor/no-zero-timeout': 2,
        'meteor/blaze-consistent-eventmap-params': 2,
      },
    },
  },
}
