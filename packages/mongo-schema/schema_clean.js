// packages/mongo-schema/schema_clean.js
import { EJSON } from 'meteor/ejson';

export function clean(ir, doc, options) {
  if (options.isModifier) {
    return cleanModifier(ir, doc, options);
  }

  let result = options.mutate ? doc : EJSON.clone(doc);

  if (options.filter) {
    result = filterUnknownKeys(ir, result);
  }

  if (options.autoConvert) {
    result = autoConvertTypes(ir, result);
  }

  if (options.removeEmptyStrings) {
    result = removeEmptyStrings(ir, result);
  }

  if (options.removeNullsFromArrays) {
    removeNullsFromArrays(ir, result);
  }

  if (options.trimStrings) {
    result = trimStrings(ir, result);
  }

  if (options.getAutoValues) {
    applyDefaultValues(ir, result, '');
    applyAutoValues(ir, result, options, '');
  }

  return result;
}

// ---- Modifier mode ----

function cleanModifier(ir, modifier, options) {
  let result = options.mutate ? modifier : EJSON.clone(modifier);
  const operatorFields = ['$set', '$setOnInsert', '$inc', '$push', '$addToSet'];

  for (const op of operatorFields) {
    if (!result[op]) continue;
    if (options.filter) {
      result[op] = filterUnknownKeysFlat(ir, result[op]);
    }
    if (options.autoConvert) {
      result[op] = autoConvertTypesFlat(ir, result[op]);
    }
    if (options.removeEmptyStrings) {
      result[op] = removeEmptyStrings(ir, result[op]);
    }
    if (options.trimStrings) {
      result[op] = trimStringsFlat(ir, result[op]);
    }
  }

  if (options.getAutoValues) {
    result = applyAutoValuesModifier(ir, result, options);
  }

  return result;
}

function filterUnknownKeysFlat(ir, fields) {
  const filtered = {};
  for (const [key, value] of Object.entries(fields)) {
    if (ir.has(key)) filtered[key] = value;
  }
  return filtered;
}

function autoConvertTypesFlat(ir, fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const desc = ir.get(key);
    if (!desc) continue;
    fields[key] = convertValue(value, desc.resolvedType.name);
  }
  return fields;
}

function trimStringsFlat(ir, fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      const desc = ir.get(key);
      if (!desc || desc.trim !== false) {
        fields[key] = value.trim();
      }
    }
  }
  return fields;
}

function applyAutoValuesModifier(ir, modifier, options) {
  const extCtx = options.extendAutoValueContext || {};

  for (const [key, desc] of ir) {
    if (!desc.autoValue) continue;
    if (key.includes('.')) continue; // top-level only for v1

    let operator = null;
    let fieldValue = undefined;
    let isSet = false;
    for (const op of ['$set', '$setOnInsert', '$unset', '$inc', '$push', '$addToSet']) {
      if (modifier[op] && modifier[op][key] !== undefined) {
        operator = op;
        fieldValue = modifier[op][key];
        isSet = true;
        break;
      }
    }

    let unsetCalled = false;
    const context = {
      key,
      genericKey: key,
      value: fieldValue,
      isSet,
      operator,
      obj: modifier,
      isModifier: true,
      field(name) {
        for (const op of ['$set', '$setOnInsert', '$unset', '$inc']) {
          if (modifier[op] && modifier[op][name] !== undefined) {
            return { isSet: true, value: modifier[op][name], operator: op };
          }
        }
        return { isSet: false, value: undefined, operator: null };
      },
      siblingField(name) { return this.field(name); },
      parentField() { return { isSet: true, value: modifier, operator: null }; },
      unset() { unsetCalled = true; },
      ...extCtx,
    };

    const result = desc.autoValue.call(context);

    if (unsetCalled) {
      for (const op of ['$set', '$setOnInsert']) {
        if (modifier[op]) delete modifier[op][key];
      }
      if (!modifier.$unset) modifier.$unset = {};
      modifier.$unset[key] = '';
    } else if (result !== undefined) {
      if (typeof result === 'object' && result !== null && !(result instanceof Date)) {
        const opKeys = Object.keys(result).filter(k => k.startsWith('$'));
        if (opKeys.length === 1) {
          const op = opKeys[0];
          if (!modifier[op]) modifier[op] = {};
          modifier[op][key] = result[op];
          continue;
        }
      }
      if (!modifier.$set) modifier.$set = {};
      modifier.$set[key] = result;
    }
  }
  return modifier;
}

// ---- Plain doc helpers ----

function removeNullsFromArrays(ir, doc) {
  for (const [key, value] of Object.entries(doc)) {
    if (Array.isArray(value)) {
      doc[key] = value.filter(item => item !== null);
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      removeNullsFromArrays(ir, value);
    }
  }
}

function filterUnknownKeys(ir, doc) {
  const filtered = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === '_id' || ir.has(key)) {
      filtered[key] = value;
    }
  }
  // For nested objects, recurse
  for (const [key, desc] of ir) {
    if (key.includes('.') || !desc.children) continue;
    if (filtered[key] && typeof filtered[key] === 'object' && !Array.isArray(filtered[key])) {
      filtered[key] = filterNestedObject(ir, key, filtered[key]);
    }
  }
  return filtered;
}

function filterNestedObject(ir, parentKey, obj) {
  const filtered = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = `${parentKey}.${key}`;
    if (ir.has(fullKey)) {
      filtered[key] = value;
      // Recurse deeper
      const desc = ir.get(fullKey);
      if (desc.children && desc.children.length > 0 && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        filtered[key] = filterNestedObject(ir, fullKey, value);
      }
    }
  }
  return filtered;
}

function trimStrings(ir, doc) {
  for (const [key, value] of Object.entries(doc)) {
    if (typeof value === 'string') {
      const desc = ir.get(key);
      if (!desc || desc.trim !== false) {
        doc[key] = value.trim();
      }
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      trimNestedStrings(ir, key, value);
    }
    if (Array.isArray(value)) {
      trimArrayStrings(ir, key, value);
    }
  }
  return doc;
}

function trimNestedStrings(ir, parentKey, obj) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = `${parentKey}.${key}`;
    if (typeof value === 'string') {
      const desc = ir.get(fullKey);
      if (!desc || desc.trim !== false) {
        obj[key] = value.trim();
      }
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      trimNestedStrings(ir, fullKey, value);
    }
  }
}

function trimArrayStrings(ir, parentKey, arr) {
  const itemKey = `${parentKey}.$`;
  const desc = ir.get(itemKey);
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] === 'string' && (!desc || desc.trim !== false)) {
      arr[i] = arr[i].trim();
    }
    if (typeof arr[i] === 'object' && arr[i] !== null && !Array.isArray(arr[i]) && !(arr[i] instanceof Date)) {
      trimNestedStrings(ir, itemKey, arr[i]);
    }
  }
}

function removeEmptyStrings(ir, doc) {
  for (const [key, value] of Object.entries(doc)) {
    if (typeof value === 'string' && value === '') {
      delete doc[key];
    }
  }
  return doc;
}

function autoConvertTypes(ir, doc) {
  for (const [key, value] of Object.entries(doc)) {
    if (value === undefined || value === null) continue;
    const desc = ir.get(key);
    if (!desc) continue;
    const typeName = desc.resolvedType.name;
    doc[key] = convertValue(value, typeName);
  }
  return doc;
}

function convertValue(value, typeName) {
  if (typeName === 'number' || typeName === 'integer') {
    if (typeof value === 'string') {
      const num = Number(value);
      if (!isNaN(num) && value.trim() !== '') return num;
    }
  }
  if (typeName === 'string') {
    if (typeof value === 'number') return String(value);
  }
  if (typeName === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  if (typeName === 'date') {
    if (typeof value === 'string') {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return value;
}

/**
 * Apply defaultValues recursively. `prefix` tracks the current dot-path
 * into `doc` so nested fields like 'address.country' resolve correctly.
 */
function applyDefaultValues(ir, doc, prefix) {
  for (const [key, desc] of ir) {
    if (desc.defaultValue === undefined) continue;

    // Only process keys that belong to the current nesting level
    if (prefix === '') {
      if (key.includes('.')) continue; // handled when we recurse into parent
    } else {
      if (!key.startsWith(prefix + '.')) continue;
      const remainder = key.slice(prefix.length + 1);
      if (remainder.includes('.')) continue; // deeper nested, skip
    }

    const localKey = prefix ? key.slice(prefix.length + 1) : key;
    if (doc[localKey] === undefined) {
      doc[localKey] = typeof desc.defaultValue === 'object'
        ? EJSON.clone(desc.defaultValue)
        : desc.defaultValue;
    }
  }

  // Recurse into nested objects
  for (const [key, desc] of ir) {
    if (desc.resolvedType && desc.resolvedType.name === 'object' && desc.children) {
      const localKey = prefix ? key.slice(prefix.length + 1) : key;
      if (!localKey.includes('.') && doc[localKey] && typeof doc[localKey] === 'object') {
        applyDefaultValues(ir, doc[localKey], key);
      }
    }
  }
}

/**
 * Apply autoValues recursively. Handles nested fields by walking into objects.
 */
function applyAutoValues(ir, doc, options, prefix) {
  const extCtx = options.extendAutoValueContext || {};
  const rootDoc = prefix === '' ? doc : options._rootDoc || doc;

  for (const [key, desc] of ir) {
    if (!desc.autoValue) continue;

    // Only process keys at the current nesting level
    if (prefix === '') {
      if (key.includes('.')) continue;
    } else {
      if (!key.startsWith(prefix + '.')) continue;
      const remainder = key.slice(prefix.length + 1);
      if (remainder.includes('.')) continue;
    }

    const localKey = prefix ? key.slice(prefix.length + 1) : key;
    const fieldValue = doc[localKey];
    const isSet = fieldValue !== undefined;
    let unsetCalled = false;

    // Build sibling-aware context
    const parentPath = key.includes('.') ? key.slice(0, key.lastIndexOf('.')) : '';

    const context = {
      key,
      genericKey: key.replace(/\.\d+\./g, '.$.').replace(/\.\d+$/, '.$'),
      value: fieldValue,
      isSet,
      operator: null,
      obj: rootDoc,
      field(name) {
        const val = getNestedValue(rootDoc, name);
        return { isSet: val !== undefined, value: val, operator: null };
      },
      siblingField(name) {
        const siblingPath = parentPath ? `${parentPath}.${name}` : name;
        const val = getNestedValue(rootDoc, siblingPath);
        return { isSet: val !== undefined, value: val, operator: null };
      },
      parentField() {
        if (!parentPath) return { isSet: true, value: rootDoc, operator: null };
        const val = getNestedValue(rootDoc, parentPath);
        return { isSet: val !== undefined, value: val, operator: null };
      },
      unset() { unsetCalled = true; },
      ...extCtx,
    };

    const result = desc.autoValue.call(context);

    // Dev warning: operator return in non-modifier context
    if (result !== undefined && typeof result === 'object' && result !== null
        && !(result instanceof Date) && !options.isModifier) {
      const opKeys = Object.keys(result).filter(k => k.startsWith('$'));
      if (opKeys.length > 0 && typeof Meteor !== 'undefined' && Meteor.isDevelopment) {
        console.warn(
          `MongoSchema: autoValue for "${key}" returned operator object in non-modifier context. ` +
          `This sets the field to the literal object. Did you mean to check this.isInsert/isUpdate?`
        );
      }
    }

    if (unsetCalled) {
      delete doc[localKey];
    } else if (result !== undefined) {
      doc[localKey] = result;
    }
  }

  // Recurse into nested objects
  for (const [key, desc] of ir) {
    if (desc.resolvedType && desc.resolvedType.name === 'object' && desc.children) {
      const localKey = prefix ? key.slice(prefix.length + 1) : key;
      if (!localKey.includes('.') && doc[localKey] && typeof doc[localKey] === 'object') {
        applyAutoValues(ir, doc[localKey], { ...options, _rootDoc: rootDoc }, key);
      }
    }
  }
}

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}
