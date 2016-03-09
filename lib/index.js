import auditArgumentChecks from './rules/audit-argument-checks'
import noSession from './rules/no-session'
import noBlazeLifecycleAssignment from './rules/no-blaze-lifecycle-assignment'
import noZeroTimeout from './rules/no-zero-timeout'
import blazeConsistentEventMapParams from './rules/blaze-consistent-eventmap-params'
import preferSessionEquals from './rules/prefer-session-equals'
import templateNamingConvention from './rules/template-naming-convention'

export default {
  rules: {
    'audit-argument-checks': auditArgumentChecks,
    'no-session': noSession,
    'no-blaze-lifecycle-assignment': noBlazeLifecycleAssignment,
    'no-zero-timeout': noZeroTimeout,
    'blaze-consistent-eventmap-params': blazeConsistentEventMapParams,
    'prefer-session-equals': preferSessionEquals,
    'template-naming-convention': templateNamingConvention,
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
        'meteor/prefer-session-equals': 0,
        'meteor/template-naming-convention': 2,
      },
    },
  },
}
