module.exports = function getPropertyName(property) {
  if (property.type === 'Literal') {
    return property.value;
  }
  if (property.type === 'Identifier') {
    return property.name;
  }
  return false;
};
