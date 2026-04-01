// packages/mongo-schema/schema_clean.js

/**
 * @module mongo-schema/schema_clean
 * @summary Document cleaning pipeline. Transforms raw documents (or MongoDB
 * update modifiers) to conform to a schema by filtering unknown keys,
 * auto-converting types, trimming strings, removing empty strings, and
 * applying default/auto values.
 */

import { EJSON } from 'meteor/ejson';

/**
 * @typedef {Object} CleanOptions
 * @property {boolean} [mutate=false] - If `true`, mutates the input document in place.
 *   If `false`, a deep clone is created first via `EJSON.clone`.
 * @property {boolean} [filter=true] - Remove keys not defined in the schema.
 * @property {boolean} [autoConvert=true] - Attempt automatic type conversion (e.g.,
 *   `"42"` → `42` for number fields, `"true"` → `true` for booleans).
 * @property {boolean} [removeEmptyStrings=true] - Delete fields whose value is `""`.
 * @property {boolean} [removeNullsFromArrays=false] - Filter out `null` entries from arrays.
 * @property {boolean} [trimStrings=true] - Trim leading/trailing whitespace from all string
 *   fields (unless the field's `trim` option is `false`).
 * @property {boolean} [getAutoValues=true] - Apply `defaultValue` and `autoValue` functions.
 * @property {boolean} [isModifier=false] - Treat the document as a MongoDB update modifier
 *   (e.g., `{ $set: { ... } }`). Cleaning is applied within each operator.
 * @property {boolean} [isUpsert=false] - Indicates an upsert context for auto-value functions.
 * @property {Object} [extendAutoValueContext] - Extra properties merged into the `this` context
 *   of `autoValue` functions (e.g., `{ userId, isFromTrustedCode }`).
 */

/**
 * Clean a document or modifier according to the schema IR and options.
 *
 * The cleaning pipeline runs in this order:
 * 1. **filter** — remove keys not in the schema
 * 2. **autoConvert** — coerce values to their declared types
 * 3. **removeEmptyStrings** — delete `""` values
 * 4. **removeNullsFromArrays** — strip `null` from array entries
 * 5. **trimStrings** — trim whitespace from strings
 * 6. **getAutoValues** — apply `defaultValue` then `autoValue` functions
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} doc - The document or modifier to clean.
 * @param {CleanOptions} options - Cleaning options (merged with schema-level defaults).
 * @returns {Object} The cleaned document (a new object unless `mutate` is `true`).
 *
 * @example
 * const schema = new MongoSchema({
 *   name: { type: String, defaultValue: 'Anonymous' },
 *   age: Number,
 * });
 *
 * schema.clean({ name: '  Alice  ', age: '30', extra: true });
 * // => { name: 'Alice', age: 30 }
 */
export function clean(ir, doc, options) {
  if (options.isModifier) {
    return cleanModifier(ir, doc, options);
  }

  let result = options.mutate ? doc : EJSON.clone(doc);

  if (options.filter) {
    if (options.mutate) {
      // Delete unknown keys in place to preserve object reference
      for (const key of Object.keys(result)) {
        if (key !== '_id' && !ir.has(key)) {
          delete result[key];
        }
      }
      for (const [key, desc] of ir) {
        if (key.includes('.') || !desc.children) continue;
        if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = filterNestedObject(ir, key, result[key]);
        }
      }
    } else {
      result = filterUnknownKeys(ir, result);
    }
  }

  if (options.autoConvert) {
    result = autoConvertTypes(ir, result);
  }

  if (options.removeEmptyStrings) {
    result = removeEmptyStrings(ir, result);
  }

  if (options.removeNullsFromArrays) {
    result = removeNullsFromArrays(ir, result);
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

/**
 * Clean a MongoDB update modifier by applying the cleaning pipeline to each
 * operator's field set (`$set`, `$setOnInsert`, `$inc`, `$push`, `$addToSet`).
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} modifier - MongoDB update modifier (e.g., `{ $set: { name: 'Bob' } }`).
 * @param {CleanOptions} options - Cleaning options.
 * @returns {Object} The cleaned modifier.
 */
function cleanModifier(ir, modifier, options) {
  let result = options.mutate ? modifier : EJSON.clone(modifier);
  const operatorFields = ['$set', '$setOnInsert', '$unset', '$inc', '$push', '$addToSet'];

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

/**
 * Remove keys from a flat field map that are not present in the schema IR.
 * Used for modifier operators where fields are flat dot-paths.
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} fields - Flat key-value map from a modifier operator.
 * @returns {Object} Filtered copy containing only known keys.
 */
function filterUnknownKeysFlat(ir, fields) {
  const filtered = {};
  for (const [key, value] of Object.entries(fields)) {
    if (ir.has(key)) filtered[key] = value;
  }
  return filtered;
}

/**
 * Auto-convert types for flat modifier fields.
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} fields - Flat key-value map from a modifier operator.
 * @returns {Object} The same object with values converted in place.
 */
function autoConvertTypesFlat(ir, fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const desc = ir.get(key);
    if (!desc) continue;
    fields[key] = convertValue(value, desc.resolvedType.name);
  }
  return fields;
}

/**
 * Trim string values in flat modifier fields (unless the field has `trim: false`).
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} fields - Flat key-value map from a modifier operator.
 * @returns {Object} The same object with strings trimmed in place.
 */
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

/**
 * Apply `autoValue` functions to modifier fields. For each field with an `autoValue`,
 * builds a context object exposing `key`, `value`, `isSet`, `operator`, `field()`,
 * `siblingField()`, `parentField()`, and `unset()`.
 *
 * The `autoValue` function may:
 * - Return a value → sets it via `$set` (or applies an operator object like `{ $inc: 1 }`)
 * - Call `this.unset()` → removes the field from `$set`/`$setOnInsert` and adds `$unset`
 * - Return `undefined` → no change
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} modifier - The MongoDB update modifier.
 * @param {CleanOptions} options - Cleaning options (may include `extendAutoValueContext`).
 * @returns {Object} The modifier with auto-values applied.
 */
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
        for (const op of ['$set', '$setOnInsert', '$unset', '$inc', '$push', '$addToSet']) {
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

/**
 * Recursively remove `null` entries from all arrays in the document.
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} doc - Document to process (mutated in place).
 */
function removeNullsFromArrays(ir, doc) {
  for (const [key, value] of Object.entries(doc)) {
    if (Array.isArray(value)) {
      doc[key] = value.filter(item => item !== null);
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      removeNullsFromArrays(ir, value);
    }
  }
  return doc;
}

/**
 * Remove top-level keys not defined in the schema (always keeps `_id`).
 * Recurses into nested objects using {@link filterNestedObject}.
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} doc - Document to filter.
 * @returns {Object} A new object containing only known keys.
 */
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

/**
 * Recursively filter unknown keys within a nested object.
 *
 * @param {Object} ir - Schema IR.
 * @param {string} parentKey - Dot-path of the parent field.
 * @param {Object} obj - Nested object to filter.
 * @returns {Object} A new object containing only known child keys.
 */
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

/**
 * Trim whitespace from all string values in a document, including nested objects
 * and array items. Respects `trim: false` on individual fields.
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} doc - Document to process (mutated in place).
 * @returns {Object} The same document with strings trimmed.
 */
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

/**
 * @param {Object} ir
 * @param {string} parentKey
 * @param {Object} obj
 */
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

/**
 * @param {Object} ir
 * @param {string} parentKey
 * @param {Array} arr
 */
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

/**
 * Remove fields with empty string values (`""`) from the document.
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} doc - Document to process (mutated in place).
 * @returns {Object} The same document with empty strings removed.
 */
function removeEmptyStrings(ir, doc) {
  for (const [key, value] of Object.entries(doc)) {
    if (typeof value === 'string' && value === '') {
      delete doc[key];
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      removeEmptyStrings(ir, value);
    }
  }
  return doc;
}

/**
 * Auto-convert top-level field values to their declared types where a safe
 * conversion exists (e.g., string→number, number→string, string→boolean,
 * string→date).
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} doc - Document to process (mutated in place).
 * @returns {Object} The same document with converted values.
 */
function autoConvertTypes(ir, doc, prefix) {
  if (prefix === undefined) prefix = '';
  for (const [key, value] of Object.entries(doc)) {
    if (value === undefined || value === null) continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const desc = ir.get(fullKey);
    if (!desc) continue;
    const typeName = desc.resolvedType.name;
    doc[key] = convertValue(value, typeName);

    // Recurse into nested objects
    if (typeof doc[key] === 'object' && doc[key] !== null && !Array.isArray(doc[key]) && !(doc[key] instanceof Date) && desc.children) {
      autoConvertTypes(ir, doc[key], fullKey);
    }

    // Recurse into arrays
    if (Array.isArray(doc[key]) && desc.itemKey) {
      const itemDesc = ir.get(desc.itemKey);
      if (itemDesc) {
        for (let i = 0; i < doc[key].length; i++) {
          const item = doc[key][i];
          if (item === undefined || item === null) continue;
          doc[key][i] = convertValue(item, itemDesc.resolvedType.name);
          if (typeof doc[key][i] === 'object' && doc[key][i] !== null && !Array.isArray(doc[key][i]) && !(doc[key][i] instanceof Date) && itemDesc.children) {
            autoConvertTypes(ir, doc[key][i], desc.itemKey);
          }
        }
      }
    }
  }
  return doc;
}

/**
 * Attempt to convert a single value to the target type.
 *
 * | Target | Input | Conversion |
 * |--------|-------|------------|
 * | `number`/`integer` | string | `Number(value)` if non-empty and not NaN |
 * | `string` | number | `String(value)` |
 * | `boolean` | string | `'true'` → `true`, `'false'` → `false` |
 * | `date` | string | `new Date(value)` if valid |
 *
 * @param {*} value - The value to convert.
 * @param {string} typeName - Target type name from the resolved type descriptor.
 * @returns {*} The converted value, or the original if no conversion applies.
 */
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
 * Apply `defaultValue`s recursively. `prefix` tracks the current dot-path
 * into `doc` so nested fields like `'address.country'` resolve correctly.
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} doc - Document to apply defaults to (mutated in place).
 * @param {string} prefix - Current dot-path prefix (empty string for top level).
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
    if (desc.resolvedType && (desc.resolvedType.name === 'object' || desc.resolvedType.name === 'schema') && desc.children) {
      const localKey = prefix ? key.slice(prefix.length + 1) : key;
      if (!localKey.includes('.') && doc[localKey] && typeof doc[localKey] === 'object') {
        applyDefaultValues(ir, doc[localKey], key);
      }
    }
  }
}

/**
 * @typedef {Object} AutoValueContext
 * @property {string} key - The full dot-path key of the field being processed.
 * @property {string} genericKey - The key with numeric indices replaced by `$`
 *   (e.g., `'items.0.name'` → `'items.$.name'`).
 * @property {*} value - The current value of the field (`undefined` if unset).
 * @property {boolean} isSet - Whether the field has a value.
 * @property {string|null} operator - The MongoDB operator (e.g., `'$set'`) or `null` for plain docs.
 * @property {Object} obj - The root document or modifier being cleaned.
 * @property {boolean} [isModifier] - `true` when cleaning a modifier.
 * @property {Function} field -
 *   Look up another field by its full dot-path key.
 * @property {Function} siblingField -
 *   Look up a sibling field by its local key name.
 * @property {Function} parentField -
 *   Access the parent object.
 * @property {Function} unset - Call to remove this field from the document.
 */

/**
 * Apply `autoValue` functions recursively. Handles nested fields by walking into objects.
 *
 * @param {Object} ir - Schema IR.
 * @param {Object} doc - Document to apply auto-values to (mutated in place).
 * @param {CleanOptions} options - Cleaning options.
 * @param {string} prefix - Current dot-path prefix.
 * @param {Object} [rootDoc] - The top-level document (used for cross-field lookups).
 */
function applyAutoValues(ir, doc, options, prefix, rootDoc) {
  const extCtx = options.extendAutoValueContext || {};
  if (rootDoc === undefined) rootDoc = doc;

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
    if (desc.resolvedType && (desc.resolvedType.name === 'object' || desc.resolvedType.name === 'schema') && desc.children) {
      const localKey = prefix ? key.slice(prefix.length + 1) : key;
      if (!localKey.includes('.') && doc[localKey] && typeof doc[localKey] === 'object') {
        applyAutoValues(ir, doc[localKey], options, key, rootDoc);
      }
    }
  }
}

/**
 * Retrieve a deeply nested value from an object using a dot-delimited path.
 *
 * @param {Object} obj - Root object to traverse.
 * @param {string} path - Dot-delimited path (e.g., `'address.city'`).
 * @returns {*} The value at the path, or `undefined` if any segment is missing.
 */
export function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}
