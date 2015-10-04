import isMeteorProp from './isMeteorProp'

export default function (node, propName) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    isMeteorProp(node.callee, propName)
  )
}
