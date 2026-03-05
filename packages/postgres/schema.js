// Reserved SQL keywords that need quoting (common subset)
const RESERVED_WORDS = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc',
  'between', 'by', 'case', 'cast', 'check', 'column', 'constraint',
  'create', 'cross', 'current', 'default', 'delete', 'desc', 'distinct',
  'do', 'else', 'end', 'except', 'exists', 'false', 'for', 'foreign',
  'from', 'full', 'grant', 'group', 'having', 'in', 'index', 'inner',
  'insert', 'intersect', 'into', 'is', 'join', 'key', 'left', 'like',
  'limit', 'not', 'null', 'offset', 'on', 'or', 'order', 'outer',
  'primary', 'references', 'right', 'select', 'set', 'table', 'then',
  'to', 'true', 'union', 'unique', 'update', 'user', 'using', 'values',
  'when', 'where', 'with',
]);

const VALID_COLUMN_TYPES = new Set([
  'text', 'integer', 'numeric', 'boolean', 'timestamp', 'jsonb',
]);

/**
 * Quote a SQL identifier if it contains uppercase letters, special
 * characters, or is a reserved word.
 */
export function quoteIdent(name) {
  if (RESERVED_WORDS.has(name.toLowerCase()) || /[A-Z]/.test(name) || /[^a-z0-9_]/.test(name)) {
    return '"' + name.replace(/"/g, '""') + '"';
  }
  return name;
}

/**
 * ResolvedSchema — normalizes user schema into typed column maps.
 *
 * Provides field resolution: given a field path, determines whether it
 * maps to a native column, a JSONB path inside a JSONB column, or
 * overflow into the _extra JSONB column.
 */
export class ResolvedSchema {
  /**
   * @param {Object} schemaDef - User-provided schema definition
   *   e.g. { title: { type: 'text', required: true }, views: { type: 'integer', default: 0 } }
   */
  constructor(schemaDef) {
    this.columns = new Map();
    this._raw = schemaDef;

    for (const [name, def] of Object.entries(schemaDef)) {
      const typeName = (typeof def === 'string') ? def : def.type;
      if (!VALID_COLUMN_TYPES.has(typeName)) {
        throw new Error(`Invalid column type "${typeName}" for field "${name}". Valid types: ${[...VALID_COLUMN_TYPES].join(', ')}`);
      }
      this.columns.set(name, {
        name,
        type: typeName,
        required: def.required || false,
        default: def.default !== undefined ? def.default : undefined,
      });
    }
  }

  /**
   * Resolve a field path to its SQL representation.
   * @param {string} fieldPath - Dot-separated field path (e.g. 'title', 'metadata.key', 'unknown.nested')
   * @returns {Object} { kind, sqlRef, columnType, topLevelField, jsonPath, needsCast }
   */
  resolveField(fieldPath) {
    return resolveField(fieldPath, this);
  }

  /**
   * Build the CREATE TABLE column definitions (excluding _id and _extra).
   * @returns {string[]} Array of column definition SQL fragments
   */
  getColumnDefinitions() {
    const defs = [];
    for (const col of this.columns.values()) {
      let sqlType;
      switch (col.type) {
        case 'text':      sqlType = 'TEXT'; break;
        case 'integer':   sqlType = 'INTEGER'; break;
        case 'numeric':   sqlType = 'NUMERIC'; break;
        case 'boolean':   sqlType = 'BOOLEAN'; break;
        case 'timestamp': sqlType = 'TIMESTAMPTZ'; break;
        case 'jsonb':     sqlType = 'JSONB'; break;
        default:          sqlType = 'TEXT'; break;
      }

      let def = `${quoteIdent(col.name)} ${sqlType}`;

      if (col.required) {
        def += ' NOT NULL';
      }

      if (col.default !== undefined) {
        if (col.default === 'now') {
          def += ' DEFAULT NOW()';
        } else if (typeof col.default === 'boolean') {
          def += ` DEFAULT ${col.default}`;
        } else if (typeof col.default === 'number') {
          def += ` DEFAULT ${col.default}`;
        } else if (typeof col.default === 'string') {
          def += ` DEFAULT '${col.default}'`;
        }
      }

      defs.push(def);
    }
    return defs;
  }

  /**
   * Get the list of all column names defined in the schema.
   * @returns {string[]}
   */
  getColumnNames() {
    return [...this.columns.keys()];
  }

  /**
   * Check if a field name is a declared schema column.
   * @param {string} name
   * @returns {boolean}
   */
  hasColumn(name) {
    return this.columns.has(name);
  }

  /**
   * Get column definition by name.
   * @param {string} name
   * @returns {Object|undefined}
   */
  getColumn(name) {
    return this.columns.get(name);
  }
}

/**
 * Core field resolution function used by all compilers.
 *
 * Given a dot-separated field path and a schema, determines how to
 * reference the field in SQL.
 *
 * @param {string} fieldPath
 * @param {ResolvedSchema|null} schema
 * @returns {{ kind: string, sqlRef: string, columnType: string|null, topLevelField: string, jsonPath: string[]|null, needsCast: boolean }}
 */
export function resolveField(fieldPath, schema) {
  // _id is always a direct column
  if (fieldPath === '_id') {
    return {
      kind: 'column',
      sqlRef: '_id',
      columnType: 'text',
      topLevelField: '_id',
      jsonPath: null,
      needsCast: false,
    };
  }

  const parts = fieldPath.split('.');
  const topLevel = parts[0];
  const hasNested = parts.length > 1;

  if (schema && schema.hasColumn(topLevel)) {
    const col = schema.getColumn(topLevel);

    if (!hasNested) {
      // Direct column access
      if (col.type === 'jsonb') {
        return {
          kind: 'jsonb_column',
          sqlRef: quoteIdent(topLevel),
          columnType: 'jsonb',
          topLevelField: topLevel,
          jsonPath: null,
          needsCast: false,
        };
      }
      return {
        kind: 'column',
        sqlRef: quoteIdent(topLevel),
        columnType: col.type,
        topLevelField: topLevel,
        jsonPath: null,
        needsCast: false,
      };
    }

    // Nested path into a schema column — must be JSONB type
    if (col.type === 'jsonb') {
      const jsonPath = parts.slice(1);
      let sqlRef;
      if (jsonPath.length === 1) {
        sqlRef = `${quoteIdent(topLevel)}->>'${jsonPath[0]}'`;
      } else {
        sqlRef = `${quoteIdent(topLevel)} #>> '{${jsonPath.join(',')}}'`;
      }
      return {
        kind: 'jsonb_path',
        sqlRef,
        columnType: 'jsonb',
        topLevelField: topLevel,
        jsonPath,
        needsCast: true,
      };
    }

    // Nested path into a non-JSONB column — doesn't make sense, treat as extra
    // Fall through to _extra handling
  }

  // Field not in schema — goes to _extra JSONB column
  if (!hasNested) {
    return {
      kind: 'extra',
      sqlRef: `_extra->>'${topLevel}'`,
      columnType: null,
      topLevelField: topLevel,
      jsonPath: null,
      needsCast: true,
    };
  }

  const jsonPath = parts;
  return {
    kind: 'extra_path',
    sqlRef: `_extra #>> '{${jsonPath.join(',')}}'`,
    columnType: null,
    topLevelField: topLevel,
    jsonPath: parts.slice(1),
    needsCast: true,
  };
}
