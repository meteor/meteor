import plugin from '../lib/index'
import assert from 'assert'
import fs from 'fs'
import path from 'path'

const rules = fs.readdirSync(path.resolve(__dirname, '../lib/rules/'))
  .filter(f => path.extname(f) === '.js')
  .map(f => path.basename(f, '.js'))

describe('all rule files should be exported by the plugin', () => {
  rules.forEach(ruleName => {
    it(`should export ${ruleName}`, () => {
      assert(plugin.rules.hasOwnProperty(ruleName))
    })
  })
})

describe('configurations', () => {
  rules.forEach(ruleName => {
    it(`should have a recommended configuration for ${ruleName}`, () => {
      assert(plugin.configs.recommended.rules.hasOwnProperty(`meteor/${ruleName}`))
    })
  })
})
