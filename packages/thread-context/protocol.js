/**
 * @module thread-context/protocol
 * @summary Wire protocol constants for the bridge MessageChannel.
 */

/** Bridge protocol version. Included in every message as `v` for forward compatibility. */
export const PROTOCOL_VERSION = 1;

/**
 * Message type discriminators used for handler routing.
 * @enum {string}
 */
export const MSG_TYPE = {
  /** Collection operations (find, insert, update, etc.) */
  COLLECTION: 'collection',
  /** Meteor method invocations */
  METHOD: 'method',
};
