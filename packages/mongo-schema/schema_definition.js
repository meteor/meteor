// packages/mongo-schema/schema_definition.js
import { resolveType } from './types.js';

const VALID_OPTIONS = new Set([
  'type', 'optional', 'required', 'defaultValue', 'autoValue',
  'min', 'max', 'exclusiveMin', 'exclusiveMax',
  'allowedValues', 'regEx', 'minCount', 'maxCount',
  'blackbox', 'trim', 'label', 'custom',
  'denyInsert', 'denyUpdate',
]);

/**
 * Normalize a single field definition from user input to canonical form.
 */
function normalizeFieldDef(def) {
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
 * Parse a full schema definition into a flat IR Map<string, FieldDescriptor>.
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

function buildChildren(ir) {
  for (const [key, desc] of ir) {
    if (desc.resolvedType.name === 'object' || desc.resolvedType.name === 'schema') {
      const children = [];
      const prefix = key + '.';
      for (const otherKey of ir.keys()) {
        if (otherKey.startsWith(prefix) && !otherKey.slice(prefix.length).includes('.')) {
          children.push(otherKey);
        }
      }
      desc.children = children;
    }
    if (desc.resolvedType.name === 'array') {
      const itemKey = key + '.$';
      if (ir.has(itemKey)) {
        desc.itemKey = itemKey;
      }
    }
  }
}

function humanizeKey(key) {
  // 'address.$.city' -> 'City', 'createdAt' -> 'Created at'
  const lastPart = key.split('.').filter(p => p !== '$').pop() || key;
  return lastPart
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}
