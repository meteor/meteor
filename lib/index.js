import getMeta from './util/getMeta'

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
    'no-session': unpack('./rules/no-session'),
    'no-blaze-lifecycle-assignment': unpack('./rules/no-blaze-lifecycle-assignment'),
    'no-zero-timeout': unpack('./rules/no-zero-timeout'),
    'audit-argument-checks': unpack('./rules/audit-argument-checks'),
    pubsub: unpack('./rules/pubsub')
  },
  rulesConfig: {
    'no-session': 0,
    'no-blaze-lifecycle-assignment': 0,
    'no-zero-timeout': 0,
    'audit-argument-checks': 0,
    pubsub: 0
  }
}
