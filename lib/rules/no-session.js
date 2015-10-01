/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 */

// import getMeteorMeta from '../util/getMeteorMeta.js'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = (/* rootPath */) => context => {
  // const fileInfo = getMeteorMeta(rootPath, context.getFilename())
  // console.log(fileInfo)

  // fileInfo is false => not in Meteor Project
  // fileInfo => {env, path, isCompatibilityFile}

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  return {

    MemberExpression (node) {
      if (node.object.name === 'Session') {
        context.report(node, 'Unexpected Session statement.')
      }
    }

  }
}

module.exports.schema = []
