/**
 * Row Converter — transforms between Meteor documents and PostgreSQL rows.
 *
 * documentToRow: Takes a Meteor document and a ResolvedSchema, produces a
 * flat row object with schema columns + _extra JSONB overflow.
 *
 * rowToDocument: Takes a PostgreSQL row and a ResolvedSchema, produces a
 * Meteor document with all fields merged.
 */

/**
 * Convert a Meteor document into a PostgreSQL row.
 *
 * Schema fields → proper typed column values.
 * Non-schema, non-_id fields → _extra JSONB object.
 *
 * @param {Object} doc - Meteor document
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {Object} Row object with column names as keys
 */
export function documentToRow(doc, schema) {
  const row = {};
  const extra = {};

  if (doc._id !== undefined) {
    row._id = String(doc._id);
  }

  const schemaColumns = schema ? schema.getColumnNames() : [];
  const schemaSet = new Set(schemaColumns);

  for (const [key, value] of Object.entries(doc)) {
    if (key === '_id') continue;

    if (schema && schemaSet.has(key)) {
      const col = schema.getColumn(key);
      row[key] = convertToColumnValue(value, col.type);
    } else {
      // Overflow to _extra
      extra[key] = value;
    }
  }

  // Always include schema columns even if not in doc (they'll be NULL/default)
  // But don't explicitly set them — let SQL defaults handle it
  // Only set _extra if there are overflow fields
  row._extra = Object.keys(extra).length > 0 ? extra : {};

  return row;
}

/**
 * Convert a PostgreSQL row back into a Meteor document.
 *
 * Schema columns → doc fields (NULL columns omitted to match Minimongo behavior).
 * _extra JSONB → merged into doc top-level.
 *
 * @param {Object} row - PostgreSQL row
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {Object} Meteor document
 */
export function rowToDocument(row, schema) {
  const doc = {};

  if (row._id !== undefined) {
    doc._id = row._id;
  }

  if (schema) {
    for (const colName of schema.getColumnNames()) {
      const value = row[colName];
      if (value === null || value === undefined) {
        // Omit NULL values — matches Minimongo's missing-field behavior
        continue;
      }
      const col = schema.getColumn(colName);
      doc[colName] = convertFromColumnValue(value, col.type);
    }
  }

  // Merge _extra overflow fields into doc
  if (row._extra && typeof row._extra === 'object') {
    for (const [key, value] of Object.entries(row._extra)) {
      doc[key] = value;
    }
  }

  // If no schema, include all non-internal columns
  if (!schema) {
    for (const [key, value] of Object.entries(row)) {
      if (key === '_id' || key === '_extra') continue;
      if (value !== null && value !== undefined) {
        doc[key] = value;
      }
    }
  }

  return doc;
}

/**
 * Convert a JS value to a PostgreSQL column value.
 * @param {*} value
 * @param {string} columnType
 * @returns {*}
 */
function convertToColumnValue(value, columnType) {
  if (value === null || value === undefined) return null;

  switch (columnType) {
    case 'timestamp':
      // JS Date → PostgreSQL TIMESTAMPTZ (pg driver handles Date natively)
      if (value instanceof Date) return value;
      if (typeof value === 'string' || typeof value === 'number') return new Date(value);
      return value;

    case 'integer':
      return typeof value === 'number' ? Math.round(value) : value;

    case 'numeric':
      return typeof value === 'number' ? value : value;

    case 'boolean':
      return !!value;

    case 'jsonb':
      // Objects/arrays pass through — pg driver serializes to JSON
      return value;

    case 'text':
    default:
      return value;
  }
}

/**
 * Convert a PostgreSQL column value back to a JS value.
 * @param {*} value
 * @param {string} columnType
 * @returns {*}
 */
function convertFromColumnValue(value, columnType) {
  if (value === null || value === undefined) return value;

  switch (columnType) {
    case 'numeric':
      // pg returns strings for numeric precision — convert back
      if (typeof value === 'string') return parseFloat(value);
      return value;

    case 'timestamp':
      // pg driver returns Date objects natively
      if (value instanceof Date) return value;
      return new Date(value);

    case 'jsonb':
      // pg driver parses JSON automatically
      return value;

    default:
      return value;
  }
}
