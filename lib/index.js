import {getMeta} from './util'

function unpack (rule) {
  const packedRule = require(rule)

  // extract rule by passing getMeta in
  const plainRule = packedRule(getMeta)
  Object.keys(packedRule).map(function (key) {
    plainRule[key] = packedRule[key]
  })
  return plainRule
}

module.exports = {
  rules: {

    // Core API
    globals: unpack('./rules/globals'),
    core: unpack('./rules/core'),
    pubsub: unpack('./rules/pubsub'),
    methods: unpack('./rules/methods'),
    check: unpack('./rules/check'),
    connections: unpack('./rules/connections'),
    collections: unpack('./rules/collections'),
    session: unpack('./rules/session'),

    // Best Practices
    'audit-argument-checks': unpack('./rules/audit-argument-checks'),
    'no-session': unpack('./rules/no-session'),
    'no-blaze-lifecycle-assignment': unpack('./rules/no-blaze-lifecycle-assignment'),
    'no-zero-timeout': unpack('./rules/no-zero-timeout'),
    'blaze-consistent-eventmap-params': unpack('./rules/blaze-consistent-eventmap-params')
  },
  rulesConfig: {

    // Core API
    globals: 0,
    core: 0,
    pubsub: 0,
    methods: 0,
    check: 0,
    connections: 0,
    collections: 0,
    session: 0,

    // Best Practices
    'audit-argument-checks': 0,
    'no-session': 0,
    'no-blaze-lifecycle-assignment': 0,
    'no-zero-timeout': 0,
    'blaze-consistent-eventmap-params': 0
  }
}
