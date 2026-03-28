// packages/mongo-schema/schema_jsonschema.js

export function compileToJsonSchema(ir) {
  const required = [];
  const properties = {};

  for (const [key, desc] of ir) {
    if (key.includes('.')) continue; // Nested handled via recursion
    properties[key] = compileField(ir, key, desc);
    if (desc.required && key !== '_id') {
      required.push(key);
    }
  }

  const schema = { bsonType: 'object' };
  if (required.length > 0) schema.required = required;
  if (Object.keys(properties).length > 0) schema.properties = properties;
  return schema;
}

function compileField(ir, key, desc) {
  const result = {};
  const typeName = desc.resolvedType.name;

  // Handle oneOf
  if (typeName === 'oneOf') {
    result.oneOf = desc.resolvedType.resolvedTypes.map(rt => {
      if (rt.bsonType) return { bsonType: rt.bsonType };
      return {};
    });
    return result;
  }

  // bsonType
  if (desc.resolvedType.bsonType) {
    result.bsonType = desc.resolvedType.bsonType;
  }

  // Nested object
  if (typeName === 'object' && desc.children && desc.children.length > 0 && !desc.blackbox) {
    const childRequired = [];
    const childProperties = {};
    for (const childKey of desc.children) {
      const childDesc = ir.get(childKey);
      const localKey = childKey.slice(key.length + 1);
      childProperties[localKey] = compileField(ir, childKey, childDesc);
      if (childDesc.required) childRequired.push(localKey);
    }
    if (childRequired.length > 0) result.required = childRequired;
    if (Object.keys(childProperties).length > 0) result.properties = childProperties;
  }

  // Array items
  if (typeName === 'array' && desc.itemKey) {
    const itemDesc = ir.get(desc.itemKey);
    result.items = compileField(ir, desc.itemKey, itemDesc);
  }

  // Constraints
  if (typeof desc.min === 'number' && typeName !== 'array') {
    if (desc.resolvedType.name === 'string') {
      result.minLength = desc.min;
    } else {
      result.minimum = desc.min;
      if (desc.exclusiveMin) result.exclusiveMinimum = true;
    }
  }
  if (typeof desc.max === 'number' && typeName !== 'array') {
    if (desc.resolvedType.name === 'string') {
      result.maxLength = desc.max;
    } else {
      result.maximum = desc.max;
      if (desc.exclusiveMax) result.exclusiveMaximum = true;
    }
  }
  if (desc.allowedValues) result.enum = desc.allowedValues;
  if (desc.regEx) {
    // MongoDB $jsonSchema only supports a single pattern. Use first if array.
    const re = Array.isArray(desc.regEx) ? desc.regEx[0] : desc.regEx;
    if (re instanceof RegExp) {
      result.pattern = re.source;
    }
  }
  if (desc.minCount !== undefined) result.minItems = desc.minCount;
  if (desc.maxCount !== undefined) result.maxItems = desc.maxCount;

  return result;
}
