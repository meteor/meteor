/* eslint-env mocha */

const plugin = require('../dist/index.js')

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const rules = fs.readdirSync(path.resolve(__dirname, '../dist/rules/'))
  .filter(function (f) {
    return path.extname(f) === '.js'
  })
  .map(function(f) {
    return path.basename(f, '.js')
  })

const defaultSettings = {}

describe('all rule files should be exported by the plugin', function() {
  rules.forEach(function(ruleName) {
    it('should export ' + ruleName, function () {
      assert.equal(
        typeof plugin.rules[ruleName],
        'function'
      )
    })

    if (defaultSettings.hasOwnProperty(ruleName)) {
      const val = defaultSettings[ruleName]
      it('should configure ' + ruleName + ' to ' + val + ' by default', function() {
        assert.equal(
          plugin.rulesConfig[ruleName],
          val
        )
      })
    } else {
      it('should configure ' + ruleName + ' off by default', function() {
        assert.equal(
          plugin.rulesConfig[ruleName],
          0
        )
      })
    }
  })
})
