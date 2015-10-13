import invariant from 'invariant'
import isMeteorProp from '../ast/isMeteorProp'
import {union, intersection} from './sets'
import invert from './invert'

// Nodes -> Set
export default function getExecutorsFromTest (test) {
  switch (test.type) {
    case 'MemberExpression':
      if (isMeteorProp(test, 'isClient')) {
        return new Set(['browser', 'cordova'])
      } else if (isMeteorProp(test, 'isServer')) {
        return new Set(['server'])
      } else if (isMeteorProp(test, 'isCordova')) {
        return new Set(['cordova'])
      }
      return invariant(false, 'Unkown Meteor prop should never be reached')
    case 'UnaryExpression':
      return invert(getExecutorsFromTest(test.argument))
    case 'LogicalExpression':
      if (test.operator === '&&') {
        return intersection(getExecutorsFromTest(test.left), getExecutorsFromTest(test.right))
      } else if (test.operator === '||') {
        return union(getExecutorsFromTest(test.left), getExecutorsFromTest(test.right))
      }
      return invariant(false, 'Unkown operator should never be reached')
  }
}
