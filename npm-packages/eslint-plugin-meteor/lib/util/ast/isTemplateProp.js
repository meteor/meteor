const getPropertyName = require('./getPropertyName');

module.exports = function isTemplateProp(node, propName) {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'MemberExpression' &&
    node.object.object.type === 'Identifier' &&
    node.object.object.name === 'Template' &&
    getPropertyName(node.property) === propName
  );
};
