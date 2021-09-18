const { isMeteorProp } = require('../ast');

/**
 * Verifies a test of an IfStatement contains only checks with
 * Meteor.isClient, Meteor.isServer and Meteor.isCordova.
 *
 * @param {node} test Test of an IfStatement (MemberExpression, LogicalExpression, UnaryExpression)
 * @return {Boolean} True if test contains only Meteor locus checks
 */
module.exports = function isMeteorBlockOnlyTest(test) {
  switch (test.type) {
    case 'MemberExpression':
      return (
        isMeteorProp(test, 'isClient') ||
        isMeteorProp(test, 'isServer') ||
        isMeteorProp(test, 'isCordova')
      );
    case 'UnaryExpression':
      if (test.operator === '!') {
        return isMeteorBlockOnlyTest(test.argument);
      }
      return false;
    case 'LogicalExpression':
      return (
        isMeteorBlockOnlyTest(test.left) && isMeteorBlockOnlyTest(test.right)
      );
    default:
      return false;
  }
};
