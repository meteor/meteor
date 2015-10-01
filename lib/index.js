import getMeteorProjectRootPath from './util/getMeteorProjectRootPath.js'

// const getMeteorProjectRootPath = require('./util/getMeteorProjectRootPath.js');

const cwd = process.cwd()
const rootPath = getMeteorProjectRootPath(cwd)

function unpack (rule) {
  const packedRule = require(rule)
  const unpackedRule = packedRule(rootPath)
  Object.keys(packedRule).map(function (key) {
    unpackedRule[key] = packedRule[key]
  })
  return unpackedRule
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
