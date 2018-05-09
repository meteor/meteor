module.exports = function isFunction(type) {
  return type === 'ArrowFunctionExpression' || type === 'FunctionExpression';
};
