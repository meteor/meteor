module.exports = function isMeteorProp(node, propName) {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'Meteor' &&
    ((!node.computed &&
      node.property.type === 'Identifier' &&
      node.property.name === propName) ||
      (node.computed &&
        node.property.type === 'Literal' &&
        node.property.value === propName))
  );
};
