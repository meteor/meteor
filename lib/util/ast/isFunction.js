export default function isFunction (type) {
  return (
    type === 'ArrowFunctionExpression' ||
    type === 'FunctionExpression'
  )
}
