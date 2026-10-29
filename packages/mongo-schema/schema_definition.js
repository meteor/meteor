// packages/mongo-schema/schema_definition.js

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
 * Normalize a single field definition from user input to canonical form.
 *
 * Supports several shorthand syntaxes:
 * - **Bare constructor**: `{ name: String }` → `{ type: String }`
 * - **RegExp shorthand**: `{ phone: /^\d+$/ }` → `{ type: String, regEx: /^\d+$/ }`
 * - **Array shorthand**: `{ tags: [String] }` → `{ type: Array, _arrayItemType: String }`
 * - **Full form**: `{ name: { type: String, min: 1 } }` — returned as-is.
 *
 * @param {Function|RegExp|Array|FieldDefinition} def - Raw field definition from the user.
 * @returns {Object} Normalized definition in canonical form.
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
  if (Array.isArray(def)) {
    if (def.length === 0) {
      throw new Error('MongoSchema: Empty array shorthand [] is not allowed; expected one type like [String]');
    }
    if (def.length === 1) {
      return { type: Array, _arrayItemType: def[0] };
    }
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
