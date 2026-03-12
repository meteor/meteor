/**
 * Converter module for the new MongoDB Oplog format (>=5.0) to the one that Meteor
 * handles well, i.e., `$set` and `$unset`. The new format is completely new,
 * and looks as follows:
 *
 * ```js
 * { $v: 2, diff: Diff }
 * ```
 *
 * where `Diff` is a recursive structure:
 * ```js
 * {
 *   // Nested updates (sometimes also represented with an s-field).
 *   // Example: `{ $set: { 'foo.bar': 1 } }`.
 *   i: { <key>: <value>, ... },
 *
 *   // Top-level updates.
 *   // Example: `{ $set: { foo: { bar: 1 } } }`.
 *   u: { <key>: <value>, ... },
 *
 *   // Unsets.
 *   // Example: `{ $unset: { foo: '' } }`.
 *   d: { <key>: false, ... },
 *
 *   // Array operations.
 *   // Example: `{ $push: { foo: 'bar' } }`.
 *   s<key>: { a: true, u<index>: <value>, ... },
 *   ...
 *
 *   // Nested operations (sometimes also represented in the `i` field).
 *   // Example: `{ $set: { 'foo.bar': 1 } }`.
 *   s<key>: Diff,
 *   ...
 * }
 * ```
 *
 * (all fields are optional)
 */

import { EJSON } from 'meteor/ejson';

interface OplogEntry {
  $v: number;
  diff?: OplogDiff;
  $set?: Record<string, any>;
  $unset?: Record<string, true>;
}

interface OplogDiff {
  i?: Record<string, any>;
  u?: Record<string, any>;
  d?: Record<string, boolean>;
  [key: `s${string}`]: ArrayOperator | Record<string, any>;
}

interface ArrayOperator {
  a: true;
  [key: `u${number}`]: any;
}

const arrayOperatorKeyRegex = /^(a|[su]\d+)$/;

/**
 * Checks if a field is an array operator key of form 'a' or 's1' or 'u1' etc
 */
function isArrayOperatorKey(field: string): boolean {
  return arrayOperatorKeyRegex.test(field);
}

/**
 * Type guard to check if an operator is a valid array operator.
 * Array operators have 'a: true' and keys that match the arrayOperatorKeyRegex
 */
function isArrayOperator(operator: unknown): operator is ArrayOperator {
  return (
    operator !== null &&
    typeof operator === 'object' &&
    'a' in operator &&
    (operator as ArrayOperator).a === true &&
    Object.keys(operator).every(isArrayOperatorKey)
  );
}

/**
 * Joins two parts of a field path with a dot.
 * Returns the key itself if prefix is empty.
 */
function join(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

/**
 * Recursively flattens an object into a target object with dot notation paths.
 * Handles special cases:
 * - Arrays are assigned directly
 * - Custom EJSON types are preserved
 * - Mongo.ObjectIDs are preserved
 * - Plain objects are recursively flattened
 * - Empty objects are assigned directly
 */
function flattenObjectInto(
  target: Record<string, any>,
  source: any,
  prefix: string
): void {
  if (
    Array.isArray(source) ||
    typeof source !== 'object' ||
    source === null ||
    source instanceof Mongo.ObjectID ||
    EJSON._isCustomType(source)
  ) {
    target[prefix] = source;
    return;
  }

  const entries = Object.entries(source);
  if (entries.length) {
    entries.forEach(([key, value]) => {
      flattenObjectInto(target, value, join(prefix, key));
    });
  } else {
    target[prefix] = source;
  }
}

/**
 * Converts an oplog diff to a series of $set and $unset operations.
 * Handles several types of operations:
 * - Direct unsets via 'd' field
 * - Nested sets via 'i' field
 * - Top-level sets via 'u' field
 * - Array operations and nested objects via 's' prefixed fields
 *
 * Preserves the structure of EJSON custom types and ObjectIDs while
 * flattening paths into dot notation for MongoDB updates.
 */
function convertOplogDiff(
  oplogEntry: OplogEntry,
  diff: OplogDiff,
  prefix = ''
): void {
  Object.entries(diff).forEach(([diffKey, value]) => {
    if (diffKey === 'd') {
      // Handle `$unset`s
      oplogEntry.$unset ??= {};
      Object.keys(value).forEach(key => {
        oplogEntry.$unset![join(prefix, key)] = true;
      });
    } else if (diffKey === 'i') {
      // Handle (potentially) nested `$set`s
      oplogEntry.$set ??= {};
      flattenObjectInto(oplogEntry.$set, value, prefix);
    } else if (diffKey === 'u') {
      // Handle flat `$set`s
      oplogEntry.$set ??= {};
      Object.entries(value).forEach(([key, fieldValue]) => {
        oplogEntry.$set![join(prefix, key)] = fieldValue;
      });
    } else if (diffKey.startsWith('s')) {
      // Handle s-fields (array operations and nested objects)
      const key = diffKey.slice(1);
      if (isArrayOperator(value)) {
        // Array operator
        Object.entries(value).forEach(([position, fieldValue]) => {
          if (position === 'a') return;

          const positionKey = join(prefix, `${key}.${position.slice(1)}`);
          if (position[0] === 's') {
            convertOplogDiff(oplogEntry, fieldValue, positionKey);
          } else if (fieldValue === null) {
            oplogEntry.$unset ??= {};
            oplogEntry.$unset[positionKey] = true;
          } else {
            oplogEntry.$set ??= {};
            oplogEntry.$set[positionKey] = fieldValue;
          }
        });
      } else if (key) {
        // Nested object
        convertOplogDiff(oplogEntry, value, join(prefix, key));
      }
    }
  });
}

/**
 * Converts a MongoDB v2 oplog entry to v1 format.
 * Returns the original entry unchanged if it's not a v2 oplog entry
 * or doesn't contain a diff field.
 *
 * The converted entry will contain $set and $unset operations that are
 * equivalent to the v2 diff format, with paths flattened to dot notation
 * and special handling for EJSON custom types and ObjectIDs.
 */
export function oplogV2V1Converter(oplogEntry: OplogEntry): OplogEntry {
  if (oplogEntry.$v !== 2 || !oplogEntry.diff) {
    return oplogEntry;
  }

  const convertedOplogEntry: OplogEntry = { $v: 2 };
  convertOplogDiff(convertedOplogEntry, oplogEntry.diff);
  return convertedOplogEntry;
}