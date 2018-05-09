const isMeteorProp = require('./isMeteorProp');

module.exports = function isMeteorCall(node, propName) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    isMeteorProp(node.callee, propName)
  );
};
