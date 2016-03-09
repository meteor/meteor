const plugin = require('../lib/index.js')

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const rules = fs.readdirSync(path.resolve(__dirname, '../lib/rules/'))
  .filter(f => path.extname(f) === '.js')
  .map(f => path.basename(f, '.js'))

describe('all rule files should be exported by the plugin', () => {
  rules.forEach((ruleName) => {
    it(`should export ${ruleName}`, () => {
      assert.deepEqual(
        plugin.rules[ruleName],
        require(path.join('../lib/rules', ruleName))
      )
    })
  })
})

describe('configurations', () => {
  it('should export a \'recommended\' configuration', () => {
    assert(plugin.configs.recommended)
  })
})
