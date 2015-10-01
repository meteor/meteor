import getProjectRootPaths from './util/getProjectRootPaths'
import isMeteorProject from './util/isMeteorProject'
import getMeteorMeta from './util/getMeteorMeta'

const rootPaths = getProjectRootPaths(process.cwd(), isMeteorProject)
const getMeta = getMeteorMeta.bind(null, rootPaths)

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
    'audit-argument-checks': unpack('./rules/audit-argument-checks')
  },
  rulesConfig: {
    'no-session': 0,
    'no-blaze-lifecycle-assignment': 0,
    'no-zero-timeout': 0,
    'audit-argument-checks': 0
  }
}
