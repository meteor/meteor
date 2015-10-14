/**
 * @fileoverview Definitions for global Meteor variables based on environment
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

import {Variable} from 'escope'
import globalsExportedByPackages from '../util/data/globalsExportedByPackages'

module.exports = getMeta => context => {

  const {isLintedEnv, env} = getMeta(context.getFilename())

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function generateGlobalVariable (name, scope) {
    const variable = new Variable(name, scope)
    variable.eslintExplicitGlobal = false
    variable.writeable = true
    return variable
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  if (!isLintedEnv) {
    return {}
  }

  return {

    Program: function () {
      const globalScope = context.getScope()
      const variables = globalScope.variables

      // add variables of environment to globals
      Object.keys(globalsExportedByPackages).forEach(globalVar => {
        const globalVarEnv = globalsExportedByPackages[globalVar]
        if (globalVarEnv.indexOf(env) !== -1) {
          variables.push(generateGlobalVariable(globalVar, globalScope))
        }
      })
    }

  }

}

module.exports.schema = []
