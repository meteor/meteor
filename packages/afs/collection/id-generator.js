/**
 * ID generator factories for FederatedCollection.
 *
 * STRING (default): uses DDP.randomStream so the client stub and the
 * server produce the same id for a given method invocation — the
 * optimistic-UI contract Mongo.Collection relies on.
 *
 * UUID: WARNING — UUID ids are NOT client-server consistent. The server
 * uses Node's crypto.randomUUID(); the client synthesizes a UUID-v4 from
 * Random.hexString. These use different RNG streams, so optimistic-UI
 * inserts will always produce a client id that differs from the server's
 * authoritative id. Use STRING if you need the client-chosen id to
 * survive the round trip through DDP.randomStream.
 */

export function createIdGenerator(name, idGeneration = 'STRING') {
  if (idGeneration === 'UUID') {
    if (Meteor.isServer) {
      // Lazy require keeps this out of the client bundle.
      const { randomUUID } = require('crypto');
      return () => randomUUID();
    }
    return () => {
      const hex = Random.hexString(32);
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        '4' + hex.slice(13, 16),
        ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
        hex.slice(20, 32),
      ].join('-');
    };
  }

  return () => {
    const src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
    return src.id();
  };
}
