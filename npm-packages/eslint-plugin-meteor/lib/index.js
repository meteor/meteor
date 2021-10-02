const allRules = {
  'audit-argument-checks': require('./rules/audit-argument-checks'),
  'no-session': require('./rules/no-session'),
  'no-template-lifecycle-assignments': require('./rules/no-template-lifecycle-assignments'),
  'no-zero-timeout': require('./rules/no-zero-timeout'),
  'eventmap-params': require('./rules/eventmap-params'),
  'prefix-eventmap-selectors': require('./rules/prefix-eventmap-selectors'),
  'prefer-session-equals': require('./rules/prefer-session-equals'),
  'template-names': require('./rules/template-names'),
  'scope-dom-lookups': require('./rules/scope-dom-lookups'),
  'no-dom-lookup-on-created': require('./rules/no-dom-lookup-on-created'),
  'no-template-parent-data': require('./rules/no-template-parent-data'),
};

module.exports = {
  rules: allRules,
  configs: {
    recommended: {
      parserOptions: {
        ecmaVersion: 6,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      plugins: ['meteor'],
      rules: {
        'meteor/audit-argument-checks': 2,
        'meteor/no-session': 2,
        'meteor/no-template-lifecycle-assignments': 2,
        'meteor/no-zero-timeout': 2,
        'meteor/eventmap-params': 2,
        'meteor/prefix-eventmap-selectors': 0,
        'meteor/prefer-session-equals': 0,
        'meteor/template-names': 2,
        'meteor/scope-dom-lookups': 0,
        'meteor/no-dom-lookup-on-created': 0,
        'meteor/no-template-parent-data': 0,
      },
    },
  },
};
