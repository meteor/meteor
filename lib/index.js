import auditArgumentChecks from './rules/audit-argument-checks'
import noSession from './rules/no-session'
import noBlazeLifecycleAssignment from './rules/no-template-lifecycle-assignments'
import noZeroTimeout from './rules/no-zero-timeout'
import blazeConsistentEventMapParams from './rules/eventmap-params'
import preferSessionEquals from './rules/prefer-session-equals'
import templateNamingConvention from './rules/template-names'

export default {
  rules: {
    'audit-argument-checks': auditArgumentChecks,
    'no-session': noSession,
    'no-template-lifecycle-assignments': noBlazeLifecycleAssignment,
    'no-zero-timeout': noZeroTimeout,
    'eventmap-params': blazeConsistentEventMapParams,
    'prefer-session-equals': preferSessionEquals,
    'template-names': templateNamingConvention,
  },
  configs: {
    recommended: {
      rules: {
        'meteor/audit-argument-checks': 2,
        'meteor/no-session': 2,
        'meteor/no-template-lifecycle-assignments': 2,
        'meteor/no-zero-timeout': 2,
        'meteor/eventmap-params': 2,
        'meteor/prefer-session-equals': 0,
        'meteor/template-names': 2,
      },
    },
  },
}
