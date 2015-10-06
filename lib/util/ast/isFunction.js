export default function (type) {
  return (
    type === 'ArrowFunctionExpression' ||
    type === 'FunctionExpression'
  )
}
