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
import {CLIENT, SERVER, UNIVERSAL} from '../util/environment'
import globalsExportedByPackages from '../util/data/globalsExportedByPackages'
import getExecutorsFromComments from '../util/executors/getExecutorsFromComments'

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

  function addVariablesForEnv (variables, scope, targetEnv) {
    Object.keys(globalsExportedByPackages).forEach(globalVar => {
      const globalVarEnv = globalsExportedByPackages[globalVar]
      if (globalVarEnv.indexOf(targetEnv) !== -1) {
        variables.push(generateGlobalVariable(globalVar, scope))
      }
    })
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
      const comments = context.getSourceCode().getAllComments()
      const variables = globalScope.variables

      const executorsFromComments = getExecutorsFromComments(comments)

      if (executorsFromComments.size > 0) {
        const hasClient = executorsFromComments.has('browser') || executorsFromComments.has('cordova')
        const hasServer = executorsFromComments.has('server')
        if (hasClient && hasServer) {
          addVariablesForEnv(variables, globalScope, UNIVERSAL)
        } else if (hasClient) {
          addVariablesForEnv(variables, globalScope, CLIENT)
        } else {
          addVariablesForEnv(variables, globalScope, SERVER)
        }
      } else {
        addVariablesForEnv(variables, globalScope, env)
      }
    }
  }
}

module.exports.schema = []
