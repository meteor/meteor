/**
 * @fileoverview Definitions for global Meteor variables based on environment
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

import {SERVER} from '../../../dist/util/environment'
const rule = require('../../../dist/rules/globals')
const RuleTester = require('eslint').RuleTester


// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester()
ruleTester.run('globals', rule(() => ({env: SERVER, isLintedEnv: true})), {

  valid: ['Session.set("hi", true)'],
  invalid: []

})

ruleTester.run('globals', rule(() => ({env: SERVER, isLintedEnv: false})), {
  valid: ['Session.set("hi", true)'],
  invalid: []
})
