// packages/mongo-schema/schema_definition.js

/**
 * @module mongo-schema/schema_definition
 * @summary Parses user-authored schema definitions into a flat intermediate
 * representation (IR) used by validation, cleaning, and JSON Schema compilation.
 */

import { resolveType } from './types.js';

/**
 * Set of recognized keys in a field definition object. Any key outside this
 * set is silently ignored during parsing.
 * @type {Set<string>}
 */
const VALID_OPTIONS = new Set([
  'type', 'optional', 'required', 'defaultValue', 'autoValue',
  'min', 'max', 'exclusiveMin', 'exclusiveMax',
  'allowedValues', 'regEx', 'minCount', 'maxCount',
  'blackbox', 'trim', 'label', 'custom',
  'denyInsert', 'denyUpdate',
]);

/**
 * @typedef {Object} FieldDefinition
 * @property {Function|Object} type - The field type: a built-in constructor (`String`, `Number`,
 *   `Boolean`, `Date`, `Object`, `Array`), a sentinel marker (`MongoSchema.Integer`,
 *   `MongoSchema.Any`), a `MongoSchema.oneOf(...)` union, a `MongoSchema` instance for
 *   sub-schemas, or any custom constructor.
 * @property {boolean} [optional=false] - If `true`, the field is not required. Inverse of `required`.
 * @property {boolean} [required] - If `true`, the field is required. Overrides `optional` and the
 *   schema-level `requiredByDefault` option.
 * @property {*} [defaultValue] - Value applied during cleaning when the field is `undefined`.
 * @property {function(this:AutoValueContext): *} [autoValue] - Function called during cleaning to
 *   compute the field value. Receives an `AutoValueContext` as `this`.
 * @property {number|Date} [min] - Minimum value (number), minimum length (string), or earliest date.
 * @property {number|Date} [max] - Maximum value (number), maximum length (string), or latest date.
 * @property {boolean} [exclusiveMin=false] - If `true`, the `min` bound is exclusive (`>` not `>=`).
 * @property {boolean} [exclusiveMax=false] - If `true`, the `max` bound is exclusive (`<` not `<=`).
 * @property {Array|Set} [allowedValues] - Whitelist of permitted values. Sets are converted to Arrays.
 * @property {RegExp|RegExp[]} [regEx] - Regular expression(s) the string value must match.
 * @property {number} [minCount] - Minimum number of items for `Array` fields.
 * @property {number} [maxCount] - Maximum number of items for `Array` fields.
 * @property {boolean} [blackbox=false] - If `true`, nested object contents are not validated.
 * @property {boolean} [trim=true] - If `false`, strings for this field are not trimmed during cleaning.
 * @property {string} [label] - Human-readable label used in error messages. Auto-generated from
 *   the key name if `humanizeAutoLabels` is enabled.
 * @property {function(this:CustomValidatorContext): string|undefined} [custom] - Custom validation
 *   function. Return a string error type to fail validation, or `undefined` to pass.
 * @property {boolean} [denyInsert=false] - If `true`, setting this field during insert triggers an error.
 * @property {boolean} [denyUpdate=false] - If `true`, setting this field during update triggers an error.
 */

/**
 * @typedef {Object} FieldDescriptor
 * @property {import('./types.js').TypeDescriptor} resolvedType - Resolved type descriptor.
 * @property {boolean} required - Whether this field is required.
 * @property {string} [label] - Human-readable label for error messages.
 * @property {*} [defaultValue] - Default value applied during cleaning.
 * @property {Function} [autoValue] - Auto-value function.
 * @property {number|Date} [min] - Minimum constraint.
 * @property {number|Date} [max] - Maximum constraint.
 * @property {boolean} [exclusiveMin] - Exclusive minimum flag.
 * @property {boolean} [exclusiveMax] - Exclusive maximum flag.
 * @property {Array} [allowedValues] - Allowed values (always an Array in IR).
 * @property {RegExp|RegExp[]} [regEx] - Regular expression constraint(s).
 * @property {number} [minCount] - Minimum array item count.
 * @property {number} [maxCount] - Maximum array item count.
 * @property {boolean} [blackbox] - Skip nested validation for this object.
 * @property {boolean} [trim] - Whether to trim this string field.
 * @property {Function} [custom] - Custom validator function.
 * @property {boolean} [denyInsert] - Deny on insert.
 * @property {boolean} [denyUpdate] - Deny on update.
 * @property {string[]} [children] - Dot-path keys of child fields (for `object`/`schema` types).
 * @property {string} [itemKey] - Dot-path key of the array item descriptor (for `array` types).
 */

/**
 * Normalize a single field definition from user input to canonical form.
 *
 * Supports several shorthand syntaxes:
 * - **Bare constructor**: `{ name: String }` → `{ type: String }`
 * - **RegExp shorthand**: `{ phone: /^\d+$/ }` → `{ type: String, regEx: /^\d+$/ }`
 * - **Array shorthand**: `{ tags: [String] }` → `{ type: Array, _arrayItemType: String }`
 * - **Full form**: `{ name: { type: String, min: 1 } }` — returned as-is.
 *
 * @param {Function|RegExp|Array|FieldDefinition} def - Raw field definition from the user.
 * @returns {FieldDefinition & { _arrayItemType?: * }} Normalized definition in canonical form.
 * @throws {Error} If `def` is not a recognized field definition format.
 */
export function normalizeFieldDef(def) {
  // Shorthand: bare constructor (e.g., { name: String })
  if (typeof def === 'function' || (def && def._type) || (def && def._isOneOf) || (def && def._isMongoSchema)) {
    return { type: def };
  }
  // Shorthand: RegExp (e.g., { phone: /pattern/ })
  if (def instanceof RegExp) {
    return { type: String, regEx: def };
  }
  // Shorthand: Array of type (e.g., { tags: [String] })
  if (Array.isArray(def) && def.length === 1) {
    return { type: Array, _arrayItemType: def[0] };
  }
  // Full form object
  if (typeof def === 'object' && def !== null && def.type !== undefined) {
    return { ...def };
  }
  throw new Error(`MongoSchema: Invalid field definition: ${JSON.stringify(def)}`);
}

/**
 * Parse a full schema definition into a flat IR (intermediate representation).
 *
 * Each key in the returned `Map` is a dot-delimited field path (e.g., `'address.city'`
 * or `'tags.$'` for array items). The value is a {@link FieldDescriptor} containing
 * the resolved type, constraints, and metadata for that field.
 *
 * Array shorthand (`[String]`) is automatically expanded into two entries:
 * the array field itself and its item descriptor (suffixed with `.$`).
 *
 * @param {Object<string, Function|RegExp|Array|FieldDefinition>} definition - The schema
 *   definition object mapping field paths to field definitions.
 * @param {Object} [options={}] - Schema-level options.
 * @param {boolean} [options.requiredByDefault=true] - Whether fields are required by default.
 * @param {boolean} [options.humanizeAutoLabels=true] - Auto-generate labels from key names
 *   (e.g., `'createdAt'` → `'Created at'`).
 * @returns {Map<string, FieldDescriptor>} Flat IR map of field paths to descriptors.
 *
 * @example
 * const ir = parseDefinition({
 *   name: String,
 *   age: { type: MongoSchema.Integer, min: 0 },
 *   tags: [String],
 *   'address.city': String,
 *   'address.zip': { type: String, regEx: /^\d{5}$/ },
 * });
 * // ir.get('name')       → { resolvedType: { name: 'string', ... }, required: true, label: 'Name' }
 * // ir.get('tags')       → { resolvedType: { name: 'array', ... }, ... }
 * // ir.get('tags.$')     → { resolvedType: { name: 'string', ... }, ... }
 */
export function parseDefinition(definition, options = {}) {
  const ir = new Map();
  const requiredByDefault = options.requiredByDefault !== false;
  const humanizeAutoLabels = options.humanizeAutoLabels !== false;

  for (const [key, rawDef] of Object.entries(definition)) {
    const def = normalizeFieldDef(rawDef);

    // If shorthand array, expand to two entries: key (Array) + key.$ (itemType)
    if (def._arrayItemType) {
      const itemType = def._arrayItemType;
      delete def._arrayItemType;
      // Add array item definition if not already defined by user
      if (!definition[`${key}.$`]) {
        const itemDef = normalizeFieldDef(itemType);
        addField(ir, `${key}.$`, itemDef, requiredByDefault, humanizeAutoLabels);
      }
    }

    addField(ir, key, def, requiredByDefault, humanizeAutoLabels);
  }

  // Build children lists for Object/Array types
  buildChildren(ir);

  return ir;
}

/**
 * Add a single field to the IR map after resolving its type and computing
 * required/label defaults.
 *
 * @param {Map<string, FieldDescriptor>} ir - The IR being built.
 * @param {string} key - Dot-delimited field path.
 * @param {FieldDefinition} def - Normalized field definition.
 * @param {boolean} requiredByDefault - Schema-level default for required.
 * @param {boolean} humanizeAutoLabels - Whether to auto-generate labels.
 */
function addField(ir, key, def, requiredByDefault, humanizeAutoLabels) {
  const resolvedType = resolveType(def.type);

  // Determine required: _id is never required by default
  let required;
  if (key === '_id') {
    required = false;
  } else if (def.required !== undefined) {
    required = !!def.required;
  } else if (def.optional !== undefined) {
    required = !def.optional;
  } else {
    required = requiredByDefault;
  }

  // Auto-generate label
  let label = def.label;
  if (!label && humanizeAutoLabels) {
    label = humanizeKey(key);
  }

  const descriptor = {
    resolvedType,
    required,
    label,
  };

  // Copy all valid options
  for (const opt of VALID_OPTIONS) {
    if (opt === 'type' || opt === 'optional' || opt === 'required' || opt === 'label') continue;
    if (def[opt] !== undefined) {
      descriptor[opt] = def[opt];
    }
  }

  // Convert Set to Array for allowedValues
  if (descriptor.allowedValues instanceof Set) {
    descriptor.allowedValues = [...descriptor.allowedValues];
  }

  ir.set(key, descriptor);
}

/**
 * Build parent→children relationships in the IR. For each `object` or `schema`
 * type, sets `desc.children` to the list of direct child keys. For each `array`
 * type, sets `desc.itemKey` to the `key.$` item descriptor path.
 *
 * @param {Map<string, FieldDescriptor>} ir - The IR map to annotate.
 */
function buildChildren(ir) {
  // Build a parent-to-children map in O(N) instead of O(N^2)
  const childrenMap = new Map();
  for (const key of ir.keys()) {
    const dotIdx = key.lastIndexOf('.');
    if (dotIdx === -1) continue;
    const parentKey = key.substring(0, dotIdx);
    if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
    childrenMap.get(parentKey).push(key);
  }

  for (const [key, desc] of ir) {
    if (desc.resolvedType.name === 'object' || desc.resolvedType.name === 'schema') {
      desc.children = childrenMap.get(key) || [];
    }
    if (desc.resolvedType.name === 'array') {
      const itemKey = key + '.$';
      if (ir.has(itemKey)) {
        desc.itemKey = itemKey;
      }
    }
  }
}

/**
 * Convert a dot-delimited field key to a human-readable label.
 * Strips `$` segments, splits on camelCase boundaries, and capitalizes the first letter.
 *
 * @param {string} key - Field path (e.g., `'address.$.city'` or `'createdAt'`).
 * @returns {string} Humanized label (e.g., `'City'` or `'Created at'`).
 */
function humanizeKey(key) {
  // 'address.$.city' -> 'City', 'createdAt' -> 'Created at'
  const lastPart = key.split('.').filter(p => p !== '$').pop() || key;
  return lastPart
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}
