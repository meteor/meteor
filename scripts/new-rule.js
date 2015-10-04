/* eslint-disable no-console */

var fs = require('fs')
var readlineSync = require('readline-sync')
var colors = require('colors/safe')

console.log('Scaffolding new rule. Please give the following details.')
var authorName = readlineSync.question(colors.green('What is your name? '))
var ruleId = readlineSync.question(colors.green('What is the rule ID? '))
var desc = readlineSync.question(colors.green('Type a short description of this rule: '))
var failingExample = readlineSync.question(colors.green('Type a short example of the code that will fail: '))
var escapedFailingExample = failingExample.replace(`'`, `\\'`)

var doc = `# ${desc} (${ruleId})

Please describe the origin of the rule here.


## Rule Details

This rule aims to...

The following patterns are considered warnings:

\`\`\`js

// fill me in

\`\`\`

The following patterns are not warnings:

\`\`\`js

// fill me in

\`\`\`

### Options

If there are any options, describe them here. Otherwise, delete this section.

## When Not To Use It

Give a short description of when it would be appropriate to turn off this rule.

## Further Reading

If there are other links that describe the issue this rule addresses, please include them here in a bulleted list.

`


var rule = `/**
 * @fileoverview ${desc}
 * @author ${authorName}
 * @copyright 2015 ${authorName}. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = (/* getMeta */) => (/* context */) => {

  // variables should be defined here

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // any helper functions should go here or else delete this section

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  return {

    // give me methods

  }

}

module.exports.schema = [
  // fill in your schema
]

`

var test = `/**
 * @fileoverview ${desc}
 * @author ${authorName}
 * @copyright 2015 ${authorName}. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

import { CLIENT, SERVER } from '../../../dist/util/environment.js'
var rule = require('../../../dist/rules/${ruleId}')
var RuleTester = require('eslint').RuleTester


// -----------------------------------------------------------------------------
// Environments
// -----------------------------------------------------------------------------

const serverEnv = {
  path: 'server/${ruleId}.js',
  env: CLIENT
  isCompatibilityFile: false,
  isInMeteorProject: true,
  isPackageConfig: false,
  isMobileConfig: false
}

const clientEnv = {
  path: 'server/${ruleId}.js',
  env: CLIENT
  isCompatibilityFile: false,
  isInMeteorProject: true,
  isPackageConfig: false,
  isMobileConfig: false
}


// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------


var ruleTester = new RuleTester()
ruleTester.run('${ruleId}', rule(() => serverEnv), {

  valid: [
    // fill me in
  ],

  invalid: [
    {
      code: '${escapedFailingExample}',
      errors: [
        {message: 'Unexpected Session statement.', type: 'MemberExpression'}
      ]
    }
  ]

})

ruleTester.run('${ruleId}', rule(() => clientEnv), {

  valid: [
    // fill me in
  ],

  invalid: [
    {
      code: '${escapedFailingExample}',
      errors: [
        {message: 'Unexpected Session statement.', type: 'MemberExpression'}
      ]
    }
  ]

})

`

var docFileName = `docs/rules/${ruleId}.md`
var ruleFileName = `lib/rules/${ruleId}.js`
var testFileName = `tests/lib/rules/${ruleId}.js`

var writeOptions = {
  encoding: 'utf8',
  flag: 'wx'
}

try {
  fs.writeFileSync(ruleFileName, rule, writeOptions)
  fs.writeFileSync(testFileName, test, writeOptions)
  fs.writeFileSync(docFileName, doc, writeOptions)

  console.log(colors.white('✓ ') + colors.green('create ' + ruleFileName))
  console.log(colors.white('✓ ') + colors.green('create ' + testFileName))
  console.log(colors.white('✓ ') + colors.green('create ' + docFileName))
} catch (e) {
  if (e.code === 'EEXIST') {
    console.log(colors.red(`Aborting because rule already exists (${e.path})`))

    // clean up already created files
    switch (e.path) {
      case ruleFileName:
        break
      case testFileName:
        fs.unlinkSync(ruleFileName)
        break
      case docFileName:
        fs.unlinkSync(ruleFileName)
        fs.unlinkSync(testFileName)
        break
      default:
        break
    }
  } else {
    console.log(e)
  }
}
