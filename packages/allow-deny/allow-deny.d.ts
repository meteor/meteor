/** A single allow/deny rule set, as passed to `allow()` / `deny()`. */
interface AllowDenyRules {
  insert?: (userId: string, doc: Record<string, unknown>) => boolean;
  update?: (
    userId: string,
    doc: Record<string, unknown>,
    fieldNames: string[],
    modifier: Record<string, unknown>
  ) => boolean;
  remove?: (userId: string, doc: Record<string, unknown>) => boolean;
  fetch?: string[];
  transform?: ((doc: Record<string, unknown>) => unknown) | null;
}

/** The allow/deny methods mixed into every collection's prototype. */
interface CollectionPrototypeApi {
  /** Allow client-side writes matching these rules. */
  allow(rules: AllowDenyRules): void;
  /** Deny client-side writes matching these rules. */
  deny(rules: AllowDenyRules): void;
  /** Install the insert/update/remove mutation methods for this collection. */
  _defineMutationMethods(options?: { useExisting?: boolean }): void;
  /** Whether the collection currently has no allow/deny rules. */
  _isInsecure(): boolean;
}

export namespace AllowDeny {
  /** Prototype object whose members are mixed into `Mongo.Collection`. */
  var CollectionPrototype: CollectionPrototypeApi;
}
