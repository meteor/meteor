export default function getPropertyName(property) {
  if (property.type === 'Literal') {
    return property.value
  } else if (property.type === 'Identifier') {
    return property.name
  }
  return false
}
