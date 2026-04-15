export namespace MongoID {
  /**
   * Check whether a string looks like a Mongo ObjectID (24-char hex).
   */
  export function _looksLikeObjectID(str: string): boolean;

  /**
   * A Mongo-style ObjectID. Generates a random 24-character hex string if no argument is provided.
   */
  export class ObjectID {
    _str: string;

    /**
     * @param hexString Optional 24-character hexadecimal string
     * @throws Error if the hex string is invalid
     */
    constructor(hexString?: string);

    /** Check equality against another ObjectID. */
    equals(other: ObjectID): boolean;

    toString(): string;

    /** Create a deep clone. */
    clone(): ObjectID;

    /** Returns 'oid' for EJSON serialization. */
    typeName(): string;

    /** Extract the timestamp from the ObjectID. */
    getTimestamp(): number;

    /** Returns the hex string value. */
    valueOf(): string;

    /** Returns the hex string for JSON serialization. */
    toJSONValue(): string;

    /** Returns the hex string. */
    toHexString(): string;
  }

  /**
   * Stringify a Mongo ID for use as a map key.
   * Handles ObjectID instances, strings, undefined, and primitives.
   * @param id The ID to stringify
   * @returns A string representation of the ID
   */
  export function idStringify(id: string | ObjectID | undefined | number | boolean | null): string;

  /**
   * Parse a stringified Mongo ID back to its original value.
   * @param id The stringified ID
   * @returns The parsed ID value
   */
  export function idParse(id: string): string | ObjectID | undefined | number | boolean | null;
}
