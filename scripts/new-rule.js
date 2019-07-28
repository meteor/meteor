/* eslint-disable no-console, max-len */

const readlineSync = require('readline-sync');
const colors = require('colors/safe');
const fs = require('fs');

console.log('Scaffolding new rule. Please give the following details.');
const authorName = readlineSync.question(colors.green('What is your name? '));
const ruleId = readlineSync.question(colors.green('What is the rule ID? '));
const desc = readlineSync.question(
  colors.green('Type a short description of this rule: ')
);
const failingExample = readlineSync.question(
  colors.green('Type a short example of the code that will fail: ')
);
const escapedFailingExample = failingExample.replace(/'/g, "\\'");

const doc = `# ${desc} (${ruleId})

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

`;

const rule = `/**
 * @fileoverview ${desc}
 * @author ${authorName}
 * @copyright 2016 ${authorName}. All rights reserved.
 * See LICENSE file in root directory for full license.
 */


 module.exports = {
   meta: {
     schema: [],
   },
   create: (context) => {
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
 }


`;

const test = `/**
 * @fileoverview ${desc}
 * @author ${authorName}
 * @copyright 2016 ${authorName}. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const { RuleTester } = require('eslint')
const rule = require('../../../lib/rules/${ruleId}')

const ruleTester = new RuleTester()

ruleTester.run('${ruleId}', rule, {
  valid: [
    // give me some valid tests
  ],

  invalid: [
    {
      code: '${escapedFailingExample}',
      errors: [
        { message: 'The error message', type: 'MemberExpression' },
      ],
    },
  ],
})

`;

const docFileName = `docs/rules/${ruleId}.md`;
const ruleFileName = `lib/rules/${ruleId}.js`;
const testFileName = `tests/lib/rules/${ruleId}.js`;

const writeOptions = {
  encoding: 'utf8',
  flag: 'wx',
};

try {
  fs.writeFileSync(ruleFileName, rule, writeOptions);
  fs.writeFileSync(testFileName, test, writeOptions);
  fs.writeFileSync(docFileName, doc, writeOptions);

  console.log('');
  console.log(colors.green('✓ ') + colors.white(`create ${ruleFileName}`));
  console.log(colors.green('✓ ') + colors.white(`create ${testFileName}`));
  console.log(colors.green('✓ ') + colors.white(`create ${docFileName}`));
} catch (e) {
  if (e.code === 'EEXIST') {
    console.log(colors.red(`Aborting because rule already exists (${e.path})`));

    // clean up already created files
    switch (e.path) {
      case ruleFileName:
        break;
      case testFileName:
        fs.unlinkSync(ruleFileName);
        break;
      case docFileName:
        fs.unlinkSync(ruleFileName);
        fs.unlinkSync(testFileName);
        break;
      default:
        break;
    }
  } else {
    console.log(e);
  }
}
