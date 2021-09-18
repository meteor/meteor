const invariant = require('invariant');
const isMeteorProp = require('../ast/isMeteorProp');
const { union, intersection } = require('./sets');
const invert = require('./invert');

// Nodes -> Set
module.exports = function getExecutorsFromTest(test) {
  switch (test.type) {
    case 'MemberExpression':
      if (isMeteorProp(test, 'isClient')) {
        return new Set(['browser', 'cordova']);
      }
      if (isMeteorProp(test, 'isServer')) {
        return new Set(['server']);
      }
      if (isMeteorProp(test, 'isCordova')) {
        return new Set(['cordova']);
      }
      return invariant(false, 'Unkown Meteor prop should never be reached');
    case 'UnaryExpression':
      return invert(getExecutorsFromTest(test.argument));
    case 'LogicalExpression':
      if (test.operator === '&&') {
        return intersection(
          getExecutorsFromTest(test.left),
          getExecutorsFromTest(test.right)
        );
      }
      if (test.operator === '||') {
        return union(
          getExecutorsFromTest(test.left),
          getExecutorsFromTest(test.right)
        );
      }
      return invariant(false, 'Unkown operator should never be reached');
    default:
      return invariant(
        false,
        'Called getExecutorsFromTest on unkown node type'
      );
  }
};
