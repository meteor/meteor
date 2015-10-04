export default function (node, propName) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' && node.object.name === 'Meteor' &&
    node.property.type === 'Identifier' && node.property.name === propName
  )
}
